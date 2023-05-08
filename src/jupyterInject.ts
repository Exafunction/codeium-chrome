import type CodeMirror from 'codemirror';

import { CodeMirrorManager } from './codemirror';
import { EditorOptions } from '../proto/exa/codeium_common_pb/codeium_common_pb';

declare class Cell {
  code_mirror: CodeMirror.Editor;
  notebook: Notebook;
  get_text(): string;
  cell_type: 'raw' | 'markdown' | 'code';
  cell_id: string;
  handle_codemirror_keyevent(this: Cell, editor: CodeMirror.Editor, event: KeyboardEvent): void;
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

  constructor(extensionId: string, jupyter: Jupyter) {
    this.jupyter = jupyter;
    this.codeMirrorManager = new CodeMirrorManager(extensionId, {
      ideName: 'jupyter_notebook',
      ideVersion: jupyter.version,
    });
  }

  patchCellKeyEvent() {
    const beforeMainHandler = (doc: CodeMirror.Doc, event: KeyboardEvent) =>
      this.codeMirrorManager.beforeMainKeyHandler(doc, event, { tab: true, escape: false });
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
          const textModels = this.notebook.get_cells().map((cell) => cell.code_mirror.getDoc());

          codeMirrorManager.triggerCompletion(
            textModels,
            this.code_mirror.getDoc(),
            new EditorOptions({
              tabSize: BigInt(editor.getOption('tabSize') ?? 4),
              insertSpaces: !(editor.getOption('indentWithTabs') ?? false),
            }),
            undefined,
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

export function inject(extensionId: string, jupyter: Jupyter): JupyterState {
  const jupyterState = new JupyterState(extensionId, jupyter);
  jupyterState.patchCellKeyEvent();
  jupyterState.patchShortcutManagerHandler();
  return jupyterState;
}
