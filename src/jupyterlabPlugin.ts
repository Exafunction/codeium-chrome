import { type JupyterFrontEnd, type JupyterFrontEndPlugin } from '@jupyterlab/application';
import { type CodeEditor } from '@jupyterlab/codeeditor';
import { type CodeMirrorEditor, type ICodeMirror } from '@jupyterlab/codemirror';
import { type IDocumentManager } from '@jupyterlab/docmanager';
import { type IEditorTracker } from '@jupyterlab/fileeditor';
import { type INotebookTracker } from '@jupyterlab/notebook';
import { type IDisposable } from '@lumino/disposable';
import { type Widget } from '@lumino/widgets';
import type CodeMirror from 'codemirror';

import { CodeMirrorManager, addListeners } from './codemirror';
import { EditorOptions } from '../proto/exa/codeium_common_pb/codeium_common_pb';

const COMMAND_ACCEPT = 'codeium:accept-completion';
const COMMAND_DISMISS = 'codeium:dismiss-completion';

class CodeiumPlugin {
  app: JupyterFrontEnd;
  notebookTracker: INotebookTracker;
  editorTracker: IEditorTracker;
  documentManager: IDocumentManager;

  previousCellHandler?: IDisposable;
  nonNotebookWidget = new Set<string>();

  codeMirrorManager: CodeMirrorManager;

  constructor(
    readonly extensionId: string,
    app: JupyterFrontEnd,
    notebookTracker: INotebookTracker,
    editorTracker: IEditorTracker,
    documentManager: IDocumentManager,
    codeMirror: ICodeMirror
  ) {
    this.app = app;
    this.notebookTracker = notebookTracker;
    this.editorTracker = editorTracker;
    this.documentManager = documentManager;
    this.codeMirrorManager = new CodeMirrorManager(extensionId, {
      ideName: 'jupyterlab',
      ideVersion: `${app.name.toLowerCase()} ${app.version}`,
    });
    addListeners(codeMirror.CodeMirror, this.codeMirrorManager);
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
    const keyboardHandler = this.keydownHandler.bind(this);
    // There is no cellAdded listener, so resort to maintaining a single
    // listener for all cells.
    notebookTracker.activeCellChanged.connect((_notebookTracker, cell) => {
      this.previousCellHandler?.dispose();
      this.previousCellHandler = undefined;
      if (cell === null) {
        return;
      }
      this.previousCellHandler = cell.editor.addKeydownHandler(keyboardHandler);
    }, this);
    editorTracker.widgetAdded.connect((_editorTracker, widget) => {
      widget.content.editor.addKeydownHandler(keyboardHandler);
      this.nonNotebookWidget.add(widget.id);
      widget.disposed.connect(this.removeNonNotebookWidget, this);
    }, this);
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
      if (isNotebook) {
        const cells = this.notebookTracker.currentWidget?.content.widgets;
        if (cells !== undefined) {
          for (const cell of cells) {
            textModels.push((cell.editor as CodeMirrorEditor).doc);
          }
        }
      }
      const context = widget !== null ? this.documentManager.contextForWidget(widget) : undefined;
      const currentTextModel = codeMirrorEditor.doc;
      await this.codeMirrorManager.triggerCompletion(
        textModels,
        currentTextModel,
        new EditorOptions({
          tabSize: BigInt(codeMirrorEditor.getOption('tabSize')),
          insertSpaces: codeMirrorEditor.getOption('insertSpaces'),
        }),
        context?.localPath,
        () => [
          this.app.commands.addKeyBinding({
            command: COMMAND_ACCEPT,
            keys: ['Tab'],
            selector: '.CodeMirror',
          }),
          this.app.commands.addKeyBinding({
            command: COMMAND_DISMISS,
            keys: ['Escape'],
            selector: '.CodeMirror',
          }),
        ]
      );
    });
    chrome.runtime.sendMessage(this.extensionId, { type: 'success' }); // no await
    return false;
  }
}

export function getPlugin(
  extensionId: string,
  jupyterapp: JupyterFrontEnd
): JupyterFrontEndPlugin<void> {
  return {
    id: 'codeium:plugin',
    autoStart: true,
    activate: (
      app: JupyterFrontEnd,
      notebookTracker: INotebookTracker,
      editorTracker: IEditorTracker,
      documentManager: IDocumentManager,
      codeMirror: ICodeMirror
    ) => {
      // This indirection is necessary to get us a `this` to store state in.
      new CodeiumPlugin(
        extensionId,
        app,
        notebookTracker,
        editorTracker,
        documentManager,
        codeMirror
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
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      jupyterapp._pluginMap['@jupyterlab/codemirror-extension:codemirror'].provides,
    ],
  };
}
