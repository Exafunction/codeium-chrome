import type { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { type CodeEditor } from '@jupyterlab/codeeditor';
import { type CodeMirrorEditor } from '@jupyterlab/codemirror';
import { type IDocumentManager } from '@jupyterlab/docmanager';
import { type IEditorTracker } from '@jupyterlab/fileeditor';
import { type INotebookTracker } from '@jupyterlab/notebook';
import { type IDisposable } from '@lumino/disposable';
import { type Widget } from '@lumino/widgets';
import type CodeMirror from 'codemirror';

import { CodeMirrorManager } from './codemirror';
import type { JupyterLabKeyBindings, KeyCombination } from './common';
import { EditorOptions } from '../proto/exa/codeium_common_pb/codeium_common_pb';

function formatJupyterLabKeyCombination(keyCombination: KeyCombination): string {
  const parts: string[] = [];
  if (keyCombination.ctrl) parts.push('Ctrl');
  if (keyCombination.alt) parts.push('Alt');
  if (keyCombination.shift) parts.push('Shift');
  if (keyCombination.meta) parts.push('Meta');
  parts.push(keyCombination.key);
  return parts.join(' ');
}

const COMMAND_ACCEPT = 'codeium:accept-completion';
const COMMAND_DISMISS = 'codeium:dismiss-completion';

declare class CellJSON {
  cell_type: 'raw' | 'markdown' | 'code';
  source: string;
  outputs: {
    // Currently, we only look at execute_result
    output_type: 'execute_result' | 'error' | 'stream' | 'display_data';
    name?: string;
    data?: {
      'text/html': string;
      'text/plain': string;
    };
    text?: string;
  }[];
}

async function getKeybindings(extensionId: string): Promise<JupyterLabKeyBindings> {
  const allowed = await new Promise<JupyterLabKeyBindings>((resolve) => {
    chrome.runtime.sendMessage(
      extensionId,
      { type: 'jupyterlab' },
      (response: JupyterLabKeyBindings) => {
        resolve(response);
      }
    );
  });
  return allowed;
}

class CodeiumPlugin {
  app: JupyterFrontEnd;
  notebookTracker: INotebookTracker;
  editorTracker: IEditorTracker;
  documentManager: IDocumentManager;

  previousCellHandler?: IDisposable;
  nonNotebookWidget = new Set<string>();

  codeMirrorManager: CodeMirrorManager;
  keybindings: Promise<JupyterLabKeyBindings>;

  debounceMs: number;

  constructor(
    readonly extensionId: string,
    app: JupyterFrontEnd,
    notebookTracker: INotebookTracker,
    editorTracker: IEditorTracker,
    documentManager: IDocumentManager,
    debounceMs: number
  ) {
    this.app = app;
    this.notebookTracker = notebookTracker;
    this.editorTracker = editorTracker;
    this.documentManager = documentManager;
    this.debounceMs = debounceMs;
    this.codeMirrorManager = new CodeMirrorManager(extensionId, {
      ideName: 'jupyterlab',
      ideVersion: `${app.name.toLowerCase()} ${app.version}`,
    });
    // The keyboard shortcuts for these commands are added and removed depending
    // on the presence of ghost text, since they cannot defer to a shortcut on a
    // parent element.
    app.commands.addCommand(COMMAND_ACCEPT, {
      execute: () => {
        this.codeMirrorManager.acceptCompletion();
      },
    });
    app.commands.addCommand(COMMAND_DISMISS, {
      execute: () => {
        this.codeMirrorManager.clearCompletion('user dismissed');
      },
    });
    const clearCompletionInitHook = this.codeMirrorManager.clearCompletionInitHook();
    const keyboardHandler = this.keydownHandler.bind(this);
    // There is no cellAdded listener, so resort to maintaining a single
    // listener for all cells.
    notebookTracker.activeCellChanged.connect((_notebookTracker, cell) => {
      this.previousCellHandler?.dispose();
      this.previousCellHandler = undefined;
      if (cell === null) {
        return;
      }
      clearCompletionInitHook((cell.editor as CodeMirrorEditor).editor ?? null);
      this.previousCellHandler = cell.editor.addKeydownHandler(keyboardHandler);
    }, this);
    editorTracker.widgetAdded.connect((_editorTracker, widget) => {
      clearCompletionInitHook((widget.content.editor as CodeMirrorEditor).editor);
      widget.content.editor.addKeydownHandler(keyboardHandler);
      this.nonNotebookWidget.add(widget.id);
      widget.disposed.connect(this.removeNonNotebookWidget, this);
    }, this);
    this.keybindings = getKeybindings(extensionId);
  }

  removeNonNotebookWidget(w: Widget) {
    this.nonNotebookWidget.delete(w.id);
  }

  keydownHandler(editor: CodeEditor.IEditor, event: KeyboardEvent): boolean {
    // To support the Ctrl+Space shortcut.
    // TODO(prem): Make this a command.
    const codeMirrorEditor = editor as CodeMirrorEditor;
    const { consumeEvent, forceTriggerCompletion } = this.codeMirrorManager.beforeMainKeyHandler(
      codeMirrorEditor.doc,
      event,
      { tab: false, escape: false }
    );
    if (consumeEvent !== undefined) {
      return consumeEvent;
    }
    const oldString = codeMirrorEditor.doc.getValue();
    // We need to run the rest of the code after the normal DOM handler.
    // TODO(prem): Does this need debouncing?
    setTimeout(async () => {
      const keybindings = await this.keybindings;
      if (!forceTriggerCompletion) {
        const newString = codeMirrorEditor.doc.getValue();
        if (newString === oldString) {
          // Cases like arrow keys, page up/down, etc. should fall here.
          return;
        }
      }
      const textModels: CodeMirror.Doc[] = [];
      const isNotebook = codeMirrorEditor === this.notebookTracker.activeCell?.editor;
      const widget = isNotebook
        ? this.notebookTracker.currentWidget
        : this.editorTracker.currentWidget;
      let currentTextModelWithOutput = undefined;
      if (isNotebook) {
        const cells = this.notebookTracker.currentWidget?.content.widgets;
        if (cells !== undefined) {
          for (const cell of cells) {
            const doc = (cell.editor as CodeMirrorEditor).doc;
            const cellJSON = cell.model.toJSON() as CellJSON;
            if (cellJSON.outputs !== undefined && cellJSON.outputs.length > 0) {
              const isCurrentCell = cell === this.notebookTracker.currentWidget?.content.activeCell;
              const cellText = cellJSON.source;
              let outputText = '';

              for (const output of cellJSON.outputs) {
                if (output.output_type === 'execute_result' && output.data !== undefined) {
                  const data = output.data;
                  if (data['text/plain'] !== undefined) {
                    outputText = output.data['text/plain'];
                  } else if (data['text/html'] !== undefined) {
                    outputText = output.data['text/html'];
                  }
                }
                if (
                  output.output_type === 'stream' &&
                  output.name === 'stdout' &&
                  output.text !== undefined
                ) {
                  outputText = output.text;
                }
              }

              // Limit output text to 10 lines and 500 characters
              // Add the OUTPUT: prefix if it exists
              outputText = outputText
                .split('\n')
                .slice(0, 10)
                .map((line) => line.slice(0, 500))
                .join('\n');
              outputText = outputText ? '\nOUTPUT:\n' + outputText : '';

              const docCopy = doc.copy(false);
              docCopy.setValue(cellText + outputText);

              if (isCurrentCell) {
                currentTextModelWithOutput = docCopy;
                textModels.push(doc);
              } else {
                textModels.push(docCopy);
              }
            } else {
              textModels.push(doc);
            }
          }
        }
      }
      const context = widget !== null ? this.documentManager.contextForWidget(widget) : undefined;
      const currentTextModel = codeMirrorEditor.doc;
      await this.codeMirrorManager.triggerCompletion(
        true, // isNotebook
        textModels,
        currentTextModel,
        currentTextModelWithOutput,
        new EditorOptions({
          tabSize: BigInt(codeMirrorEditor.getOption('tabSize')),
          insertSpaces: codeMirrorEditor.getOption('insertSpaces'),
        }),
        context?.localPath,
        () => {
          const keybindingDisposables = [
            this.app.commands.addKeyBinding({
              command: COMMAND_ACCEPT,
              keys: [formatJupyterLabKeyCombination(keybindings.accept)],
              selector: '.CodeMirror',
            }),
          ];
          if (!this.app.hasPlugin('@axlair/jupyterlab_vim')) {
            keybindingDisposables.push(
              this.app.commands.addKeyBinding({
                command: COMMAND_DISMISS,
                keys: [formatJupyterLabKeyCombination(keybindings.dismiss)],
                selector: '.CodeMirror',
              })
            );
          }
          return keybindingDisposables;
        }
      );
    }, this.debounceMs);
    void chrome.runtime.sendMessage(this.extensionId, { type: 'success' });
    return false;
  }
}

export function getPlugin(
  extensionId: string,
  jupyterapp: JupyterFrontEnd,
  debounceMs: number
): JupyterFrontEndPlugin<void> {
  return {
    id: 'codeium:plugin',
    autoStart: true,
    activate: (
      app: JupyterFrontEnd,
      notebookTracker: INotebookTracker,
      editorTracker: IEditorTracker,
      documentManager: IDocumentManager
    ) => {
      // This indirection is necessary to get us a `this` to store state in.
      new CodeiumPlugin(
        extensionId,
        app,
        notebookTracker,
        editorTracker,
        documentManager,
        debounceMs
      );
    },
    requires: [
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      jupyterapp._pluginMap['@jupyterlab/notebook-extension:tracker'].provides,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      jupyterapp._pluginMap['@jupyterlab/fileeditor-extension:plugin'].provides,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      jupyterapp._pluginMap['@jupyterlab/docmanager-extension:plugin'].provides,
    ],
  };
}
