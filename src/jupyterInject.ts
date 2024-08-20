import type CodeMirror from 'codemirror';

import { CodeMirrorManager } from './codemirror';
import { JupyterNotebookKeyBindings } from './common';
import { EditorOptions } from '../proto/exa/codeium_common_pb/codeium_common_pb';

declare class Cell {
  code_mirror: CodeMirror.Editor;
  notebook: Notebook;
  get_text(): string;
  cell_type: 'raw' | 'markdown' | 'code';
  cell_id: string;
  handle_codemirror_keyevent(this: Cell, editor: CodeMirror.Editor, event: KeyboardEvent): void;
  output_area?: {
    outputs: {
      // Currently, we only look at execute_result
      output_type: 'execute_result' | 'error' | 'stream' | 'display_data';
      name?: string;
      data?: {
        'text/plain': string;
      };
      text?: string;
    }[];
  };
}

declare class CodeCell extends Cell {
  cell_type: 'code';
}

declare class TextCell extends Cell {
  cell_type: 'markdown';
}

interface Notebook {
  get_cells(): Cell[];
}

declare class ShortcutManager {
  call_handler(this: ShortcutManager, event: KeyboardEvent): void;
}

interface Jupyter {
  CodeCell: typeof CodeCell;
  TextCell: typeof TextCell;
  version: string;
  keyboard: {
    ShortcutManager: typeof ShortcutManager;
  };
}

class JupyterState {
  jupyter: Jupyter;
  codeMirrorManager: CodeMirrorManager;
  keybindings: JupyterNotebookKeyBindings;

  constructor(extensionId: string, jupyter: Jupyter, keybindings: JupyterNotebookKeyBindings) {
    this.jupyter = jupyter;
    this.codeMirrorManager = new CodeMirrorManager(extensionId, {
      ideName: 'jupyter_notebook',
      ideVersion: jupyter.version,
    });
    this.keybindings = keybindings;
  }

  patchCellKeyEvent() {
    const beforeMainHandler = (doc: CodeMirror.Doc, event: KeyboardEvent) => {
      return this.codeMirrorManager.beforeMainKeyHandler(
        doc,
        event,
        { tab: true, escape: false },
        this.keybindings.accept
      );
    };
    const replaceOriginalHandler = (
      handler: (this: Cell, editor: CodeMirror.Editor, event: KeyboardEvent) => void
    ) => {
      const codeMirrorManager = this.codeMirrorManager;
      return function (this: Cell, editor: CodeMirror.Editor, event: KeyboardEvent) {
        const { consumeEvent, forceTriggerCompletion } = beforeMainHandler(editor.getDoc(), event);
        if (consumeEvent !== undefined) {
          if (consumeEvent) {
            event.preventDefault();
          } else {
            handler.call(this, editor, event);
          }
          return;
        }
        const doc = editor.getDoc();
        const oldString = doc.getValue();
        setTimeout(async () => {
          if (!forceTriggerCompletion) {
            const newString = doc.getValue();
            if (newString === oldString) {
              // Cases like arrow keys, page up/down, etc. should fall here.
              return;
            }
          }
          const textModels = [];

          const editableCells = [...this.notebook.get_cells()];
          let currentModelWithOutput;
          for (const cell of editableCells) {
            let outputText = '';
            if (cell.output_area !== undefined && cell.output_area.outputs.length > 0) {
              const output = cell.output_area.outputs[0];
              if (
                output.output_type === 'execute_result' &&
                output.data !== undefined &&
                output.data['text/plain'] !== undefined
              ) {
                outputText = output.data['text/plain'];
              } else if (
                output.output_type === 'stream' &&
                output.name === 'stdout' &&
                output.text !== undefined
              ) {
                outputText = output.text;
              }

              const lines = outputText.split('\n');
              if (lines.length > 10) {
                lines.length = 10;
                outputText = lines.join('\n');
              }
              if (outputText.length > 500) {
                outputText = outputText.slice(0, 500);
              }
            }
            outputText = outputText ? '\nOUTPUT:\n' + outputText : '';
            if (cell.code_mirror.getDoc() === doc) {
              textModels.push(doc);
              currentModelWithOutput = cell.code_mirror.getDoc().copy(false);
              currentModelWithOutput.setValue(cell.get_text() + outputText);
            } else {
              const docCopy = cell.code_mirror.getDoc().copy(false);
              let docText = docCopy.getValue();
              docText += outputText;
              docCopy.setValue(docText);
              textModels.push(docCopy);
            }
          }

          const url = window.location.href;
          // URLs are usually of the form, http://localhost:XXXX/notebooks/path/to/notebook.ipynb
          // We only want the path to the notebook.
          const path = new URL(url).pathname;
          const relativePath = path.endsWith('.ipynb') ? path : undefined;

          await codeMirrorManager.triggerCompletion(
            true, // isNotebook
            textModels,
            this.code_mirror.getDoc(),
            currentModelWithOutput,
            new EditorOptions({
              tabSize: BigInt(editor.getOption('tabSize') ?? 4),
              insertSpaces: !(editor.getOption('indentWithTabs') ?? false),
            }),
            relativePath,
            undefined
          );
        });
      };
    };
    this.jupyter.CodeCell.prototype.handle_codemirror_keyevent = replaceOriginalHandler(
      this.jupyter.CodeCell.prototype.handle_codemirror_keyevent
    );
    this.jupyter.TextCell.prototype.handle_codemirror_keyevent = replaceOriginalHandler(
      this.jupyter.TextCell.prototype.handle_codemirror_keyevent
    );
  }

  patchShortcutManagerHandler() {
    const origHandler = this.jupyter.keyboard.ShortcutManager.prototype.call_handler;
    const clearCompletion = () => this.codeMirrorManager.clearCompletion('shortcut manager');
    this.jupyter.keyboard.ShortcutManager.prototype.call_handler = function (
      this: ShortcutManager,
      event: KeyboardEvent
    ) {
      if (event.key === 'Escape' && clearCompletion()) {
        event.preventDefault();
      } else {
        origHandler.call(this, event);
      }
    };
  }
}

export function inject(
  extensionId: string,
  jupyter: Jupyter,
  keybindings: JupyterNotebookKeyBindings
): JupyterState {
  const jupyterState = new JupyterState(extensionId, jupyter, keybindings);
  jupyterState.patchCellKeyEvent();
  jupyterState.patchShortcutManagerHandler();
  return jupyterState;
}
