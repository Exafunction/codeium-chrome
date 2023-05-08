import { CodeMirrorManager } from './codemirror';
import { EditorOptions } from '../proto/exa/codeium_common_pb/codeium_common_pb';

declare type CodeMirror = typeof import('codemirror');

export class CodeMirrorState {
  codeMirrorManager: CodeMirrorManager;
  docs: CodeMirror.Doc[] = [];
  hookedEditors = new WeakSet<CodeMirror.Editor>();
  constructor(extensionId: string, cm: CodeMirror | undefined, readonly multiplayer: boolean) {
    this.codeMirrorManager = new CodeMirrorManager(extensionId, {
      ideName: 'codemirror',
      ideVersion: `${cm?.version ?? 'unknown'}-${window.location.hostname}`,
    });
    if (cm !== undefined) {
      cm.defineInitHook(this.editorHook());
    }
  }

  editorHook(): (editor: CodeMirror.Editor) => void {
    const hook = this.codeMirrorManager.clearCompletionInitHook();
    return (editor) => {
      if (this.hookedEditors.has(editor)) {
        return;
      }
      this.hookedEditors.add(editor);
      this.addKeydownListener(editor, this.multiplayer);
      hook(editor);
    };
  }

  addKeydownListener(editor: CodeMirror.Editor, multiplayer: boolean) {
    const el = editor.getInputField().closest('.CodeMirror');
    if (el === null) {
      return;
    }
    if (multiplayer) {
      // This isn't always turned on because it blocks the visual improvements
      // from maybeUpdateTextMarker.
      editor.on('change', () => {
        if (!this.codeMirrorManager.documentMatchesCompletion()) {
          this.codeMirrorManager.clearCompletion('document changed');
        }
      });
    }
    editor.on('keydown', (editor: CodeMirror.Editor, event: KeyboardEvent) => {
      const { consumeEvent, forceTriggerCompletion } = this.codeMirrorManager.beforeMainKeyHandler(
        editor.getDoc(),
        event,
        { tab: true, escape: true }
      );
      if (consumeEvent !== undefined) {
        if (consumeEvent) {
          event.preventDefault();
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

        this.codeMirrorManager.triggerCompletion(
          this.docs,
          editor.getDoc(),
          new EditorOptions({
            tabSize: BigInt(editor.getOption('tabSize') ?? 4),
            insertSpaces: !(editor.getOption('indentWithTabs') ?? false),
          }),
          undefined,
          undefined
        );
      });
    });
  }
}
