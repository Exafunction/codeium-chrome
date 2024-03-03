import { IDisposable } from '@lumino/disposable';
import type CodeMirror from 'codemirror';

import { editorLanguage, language } from './codemirrorLanguages';
import { CODEIUM_DEBUG, IdeInfo, LanguageServerClient } from './common';
import { TextAndOffsets, computeTextAndOffsets } from './notebook';
import { numUtf8BytesToNumCodeUnits } from './utf';
import { EditorOptions, ExperimentKey } from '../proto/exa/codeium_common_pb/codeium_common_pb';
import {
  CompletionItem,
  CompletionPartType,
  GetCompletionsRequest,
} from '../proto/exa/language_server_pb/language_server_pb';

function computeTextAndOffsetsForCodeMirror(
  textModels: CodeMirror.Doc[],
  currentTextModel: CodeMirror.Doc
): TextAndOffsets {
  return computeTextAndOffsets({
    textModels,
    currentTextModel,
    utf16CodeUnitOffset: currentTextModel.indexFromPos(currentTextModel.getCursor()),
    getText: (model) => model.getValue(),
    getLanguage: (model) => language(model, undefined),
  });
}

interface TextMarker {
  pos: CodeMirror.Position;
  marker: CodeMirror.TextMarker<CodeMirror.Position>;
  spanElement: HTMLSpanElement;
}

// Helps simulate a typing as completed effect. Will only work on the same line.
function maybeUpdateTextMarker(
  textMarker: TextMarker,
  ch: string,
  cursor: CodeMirror.Position,
  characterBeforeCursor: string
): boolean {
  if (cursor.line != textMarker.pos.line || cursor.ch != textMarker.pos.ch) {
    return false;
  }
  if (ch === 'Backspace') {
    if (characterBeforeCursor === '') {
      return false;
    }
    textMarker.spanElement.innerText = characterBeforeCursor + textMarker.spanElement.innerText;
    return true;
  }
  if (ch.length > 1 || ch === '\n') {
    return false;
  }
  const innerText = textMarker.spanElement.innerText;
  if (innerText.length === 1) {
    // TODO(prem): Why is this necessary?
    // This was necessary for the following case:
    // In GitHub, type "def fib(n)" and accept the completion.
    // Then go to a new line in the function and type "fib(5)".
    // On the ")", it should freeze.
    return false;
  }
  if (!innerText.startsWith(ch)) {
    return false;
  }
  textMarker.spanElement.innerText = textMarker.spanElement.innerText.substring(1);
  return true;
}

export class CodeMirrorManager {
  private client: LanguageServerClient;
  private ideInfo: IdeInfo;
  private currentCompletion?: {
    completionItem: CompletionItem;
    lineWidgets: CodeMirror.LineWidget[];
    textMarkers: TextMarker[];
    disposables: IDisposable[];
    doc: CodeMirror.Doc;
    start: CodeMirror.Position;
    end: CodeMirror.Position;
    apiKey: string;
    docState: string;
  };

  constructor(extensionId: string, ideInfo: IdeInfo) {
    this.client = new LanguageServerClient(extensionId);
    this.ideInfo = ideInfo;
  }

  documentMatchesCompletion(): boolean {
    if (this.currentCompletion?.doc.getValue() !== this.currentCompletion?.docState) {
      return false;
    }
    return true;
  }

  anyTextMarkerUpdated(
    ch: string,
    cursor: CodeMirror.Position,
    characterBeforeCursor: string
  ): boolean {
    return (
      this.currentCompletion?.textMarkers.find((textMarker) =>
        maybeUpdateTextMarker(textMarker, ch, cursor, characterBeforeCursor)
      ) !== undefined
    );
  }

  async triggerCompletion(
    textModels: CodeMirror.Doc[],
    currentTextModel: CodeMirror.Doc,
    editorOptions: EditorOptions,
    relativePath: string | undefined,
    createDisposables: (() => IDisposable[]) | undefined
  ): Promise<void> {
    if (!window.codeium_enabled) {
      return;
    }
    const clientSettings = await this.client.clientSettingsPoller.clientSettings;
    if (clientSettings.apiKey === undefined) {
      return;
    }
    const apiKey = clientSettings.apiKey;
    const cursor = currentTextModel.getCursor();
    const { text, utf8ByteOffset, additionalUtf8ByteOffset } = computeTextAndOffsetsForCodeMirror(
      textModels,
      currentTextModel
    );
    const numUtf8Bytes = additionalUtf8ByteOffset + utf8ByteOffset;
    const request = new GetCompletionsRequest({
      metadata: this.client.getMetadata(this.ideInfo, apiKey),
      document: {
        text,
        editorLanguage: editorLanguage(currentTextModel),
        language: language(currentTextModel, relativePath),
        cursorOffset: BigInt(numUtf8Bytes),
        lineEnding: '\n',
        // We could use the regular path which could have a drive: prefix, but
        // this is probably unusual.
        relativePath: relativePath,
      },
      editorOptions,
      modelName: clientSettings.defaultModel,
      experimentConfig: {
        forceEnableExperiments: [ExperimentKey.JUPYTER_FORMAT],
      },
    });
    const response = await this.client.getCompletions(request);
    if (response === undefined) {
      return;
    }

    // No more await allowed below this point, given that we've checked for
    // abort, so this must be the latest debounced request.
    this.clearCompletion(
      "about to replace completions if the cursor hasn't moved and we got completions"
    );
    const newCursor = currentTextModel.getCursor();
    if (newCursor.ch !== cursor.ch || newCursor.line !== cursor.line) {
      // TODO(prem): Is this check necessary?
      return;
    }
    if (response.completionItems.length === 0) {
      return;
    }
    const completionItem = response.completionItems[0];
    this.renderCompletion(
      currentTextModel,
      completionItem,
      additionalUtf8ByteOffset,
      apiKey,
      createDisposables ? createDisposables : () => []
    );
  }

  clearCompletion(reason: string): boolean {
    const currentCompletion = this.currentCompletion;
    if (currentCompletion === undefined) {
      return false;
    }
    if (CODEIUM_DEBUG) {
      console.log('Clearing completions because', reason);
    }
    currentCompletion.disposables.forEach((disposable) => {
      disposable.dispose();
    });
    currentCompletion.lineWidgets.forEach((widget) => {
      widget.clear();
    });
    currentCompletion.textMarkers.forEach((marker) => {
      marker.marker.clear();
    });
    this.currentCompletion = undefined;
    return true;
  }

  renderCompletion(
    doc: CodeMirror.Doc,
    completionItem: CompletionItem,
    additionalUtf8ByteOffset: number,
    apiKey: string,
    createDisposables: () => IDisposable[]
  ): void {
    this.clearCompletion('about to render new completions');
    const startOffsetUtf8Bytes =
      Number(completionItem.range?.startOffset ?? 0) - additionalUtf8ByteOffset;
    const endOffsetUtf8Bytes =
      Number(completionItem.range?.endOffset ?? 0) - additionalUtf8ByteOffset;
    const currentCompletion: typeof this.currentCompletion = {
      completionItem,
      lineWidgets: [],
      textMarkers: [],
      disposables: createDisposables(),
      doc,
      start: doc.posFromIndex(numUtf8BytesToNumCodeUnits(doc.getValue(), startOffsetUtf8Bytes)),
      end: doc.posFromIndex(numUtf8BytesToNumCodeUnits(doc.getValue(), endOffsetUtf8Bytes)),
      apiKey,
      docState: doc.getValue(),
    };
    const cursor = doc.getCursor();
    let createdInlineAtCursor = false;
    completionItem.completionParts.forEach((part) => {
      if (part.type === CompletionPartType.INLINE) {
        const bookmarkElement = document.createElement('span');
        bookmarkElement.classList.add('codeium-ghost');
        bookmarkElement.innerText = part.text;
        const partOffsetBytes = Number(part.offset) - additionalUtf8ByteOffset;
        const partOffset = numUtf8BytesToNumCodeUnits(doc.getValue(), partOffsetBytes);
        const pos = doc.posFromIndex(partOffset);
        const bookmarkWidget = doc.setBookmark(pos, {
          widget: bookmarkElement,
          insertLeft: true,
          // We need all widgets to have handleMouseEvents true for the glitches
          // where the completion doesn't disappear.
          handleMouseEvents: true,
        });
        currentCompletion.textMarkers.push({
          marker: bookmarkWidget,
          pos,
          spanElement: bookmarkElement,
        });
        if (pos.line === cursor.line && pos.ch === cursor.ch) {
          createdInlineAtCursor = true;
        }
      } else if (part.type === CompletionPartType.BLOCK) {
        // We use CodeMirror's LineWidget feature to render the block ghost text element.
        const lineElement = document.createElement('div');
        lineElement.classList.add('codeium-ghost');
        part.text.split('\n').forEach((line) => {
          const preElement = document.createElement('pre');
          preElement.classList.add('CodeMirror-line', 'codeium-ghost-line');
          if (line === '') {
            line = ' ';
          }
          preElement.innerText = line;
          lineElement.appendChild(preElement);
        });
        const lineWidget = doc.addLineWidget(cursor.line, lineElement, { handleMouseEvents: true });
        currentCompletion.lineWidgets.push(lineWidget);
      }
    });
    if (!createdInlineAtCursor) {
      // This is to handle the edge case of faking typing as completed but with
      // a backspace at the end of the line, where there might not be an INLINE
      // completion part.
      const bookmarkElement = document.createElement('span');
      bookmarkElement.classList.add('codeium-ghost');
      bookmarkElement.innerText = '';
      const bookmarkWidget = doc.setBookmark(cursor, {
        widget: bookmarkElement,
        insertLeft: true,
      });
      currentCompletion.textMarkers.push({
        marker: bookmarkWidget,
        pos: cursor,
        spanElement: bookmarkElement,
      });
    }
    this.currentCompletion = currentCompletion;
  }

  acceptCompletion(): boolean {
    const completion = this.currentCompletion;
    if (completion === undefined) {
      return false;
    }
    this.clearCompletion('about to accept completions');
    const completionProto = completion.completionItem.completion;
    if (completionProto === undefined) {
      console.error('Empty completion');
      return true;
    }
    const doc = completion.doc;
    // This is a hack since we have the fake typing as completed logic.
    doc.setCursor(completion.start);
    doc.replaceRange(completionProto.text, completion.start, completion.end);
    if (
      completion.completionItem.suffix !== undefined &&
      completion.completionItem.suffix.text.length > 0
    ) {
      doc.replaceRange(completion.completionItem.suffix.text, doc.getCursor());
      const currentCursor = doc.getCursor();
      const newOffset =
        doc.indexFromPos(currentCursor) +
        Number(completion.completionItem.suffix.deltaCursorOffset);
      doc.setCursor(doc.posFromIndex(newOffset));
    }
    this.client.acceptedLastCompletion(
      this.ideInfo,
      completion.apiKey,
      completionProto.completionId
    );
    return true;
  }

  // If this returns false, don't consume the event.
  // If true, consume the event.
  // Otherwise, keep going with other logic.
  beforeMainKeyHandler(
    doc: CodeMirror.Doc,
    event: KeyboardEvent,
    alsoHandle: { tab: boolean; escape: boolean }
  ): { consumeEvent: boolean | undefined; forceTriggerCompletion: boolean } {
    let forceTriggerCompletion = false;
    if (event.ctrlKey) {
      if (event.key === ' ') {
        forceTriggerCompletion = true;
      } else {
        return { consumeEvent: false, forceTriggerCompletion };
      }
    }
    // Classic notebook may autocomplete these.
    if ('"\')}]'.includes(event.key)) {
      forceTriggerCompletion = true;
    }
    if (event.isComposing) {
      this.clearCompletion('composing');
      return { consumeEvent: false, forceTriggerCompletion };
    }
    switch (event.key) {
      case 'Delete':
      case 'ArrowDown':
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'Home':
      case 'End':
      case 'PageDown':
      case 'PageUp':
        this.clearCompletion(`key: ${event.key}`);
        return { consumeEvent: false, forceTriggerCompletion };
    }
    if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      if (alsoHandle.tab && event.key === 'Tab' && this.acceptCompletion()) {
        return { consumeEvent: true, forceTriggerCompletion };
      }
      if (alsoHandle.escape && event.key === 'Escape' && this.clearCompletion('user dismissed')) {
        return { consumeEvent: true, forceTriggerCompletion };
      }
    }
    const cursor = doc.getCursor();
    const characterBeforeCursor =
      cursor.ch === 0 ? '' : doc.getRange({ line: cursor.line, ch: cursor.ch - 1 }, cursor);
    const anyTextMarkerUpdated = this.anyTextMarkerUpdated(
      event.key,
      cursor,
      characterBeforeCursor
    );
    // We don't want caps lock to trigger a clearing of the completion, for example.
    if (!anyTextMarkerUpdated && event.key.length === 1) {
      this.clearCompletion("didn't update text marker and key is a single character");
    }
    if (event.key === 'Enter') {
      this.clearCompletion('enter');
    }
    return { consumeEvent: undefined, forceTriggerCompletion };
  }

  clearCompletionInitHook(): (editor: CodeMirror.Editor) => void {
    const editors = new WeakSet<CodeMirror.Editor>();
    return (editor: CodeMirror.Editor) => {
      if (editors.has(editor)) {
        return;
      }
      editors.add(editor);
      const el = editor.getInputField().closest('.CodeMirror');
      if (el === null) {
        return;
      }
      const div = el as HTMLDivElement;
      div.addEventListener('focusout', () => {
        this.clearCompletion('focusout');
      });
      div.addEventListener('mousedown', () => {
        this.clearCompletion('mousedown');
      });
    };
  }
}

export function addListeners(
  cm: typeof import('codemirror'),
  codeMirrorManager: CodeMirrorManager
) {
  cm.defineInitHook(codeMirrorManager.clearCompletionInitHook());
}
