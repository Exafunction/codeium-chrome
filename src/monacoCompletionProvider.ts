import type * as monaco from 'monaco-editor';

import { IdeInfo, LanguageServerClient } from './common';
import { getLanguage } from './monacoLanguages';
import { TextAndOffsets, computeTextAndOffsets } from './notebook';
import { numUtf8BytesToNumCodeUnits } from './utf';
import { Language } from '../proto/exa/codeium_common_pb/codeium_common_pb';
import {
  CompletionItem,
  GetCompletionsRequest,
} from '../proto/exa/language_server_pb/language_server_pb';

interface DatabricksModel {
  attributes: {
    type: 'commmand';
    // The text of the cell.
    command: string;
    position: number;
  };
}

declare global {
  interface Window {
    colab?: {
      global: {
        notebookModel: {
          fileId: {
            fileId: string;
            source: string;
          };
          singleDocument: { models: readonly monaco.editor.ITextModel[] };
        };
      };
    };
    colabVersionTag?: string;
    // Databricks
    notebook?: {
      commandCollection(): {
        models: readonly (any | DatabricksModel)[];
      };
    };
  }
}

declare module 'monaco-editor' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace languages {
    interface InlineCompletion {
      text?: string;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace editor {
    interface ICodeEditor {
      _commandService: { executeCommand(command: string): unknown };
    }
    interface ITextModel {
      // Seems to exist in certain versions of monaco.
      getLanguageIdentifier?: () => { language: string; id: number };
    }
  }
}

export const OMonacoSite = {
  UNSPECIFIED: 0,
  COLAB: 1,
  STACKBLITZ: 2,
  DEEPNOTE: 3,
  DATABRICKS: 4,
  QUADRATIC: 5,
  CUSTOM: 6,
} as const;
export type MonacoSite = (typeof OMonacoSite)[keyof typeof OMonacoSite];

function getEditorLanguage(model: monaco.editor.ITextModel) {
  if (model.getLanguageIdentifier !== undefined) {
    return model.getLanguageIdentifier().language;
  }
  return model.getLanguageId();
}

class MonacoRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;

  constructor(start: monaco.IPosition, end: monaco.IPosition) {
    this.startLineNumber = start.lineNumber;
    this.startColumn = start.column;
    this.endLineNumber = end.lineNumber;
    this.endColumn = end.column;
  }
}

// Some environments like Databricks will include extraneous text, such as %sql
// as the first line. We need to trim this out.
function getValueAndStartOffset(
  monacoSite: MonacoSite,
  model: monaco.editor.ITextModel | string
): { value: string; utf16Offset: number } {
  const originalValue = typeof model === 'string' ? model : model.getValue();
  if (monacoSite !== OMonacoSite.DATABRICKS || !originalValue.startsWith('%')) {
    return { value: originalValue, utf16Offset: 0 };
  }
  const indexofNewline = originalValue.indexOf('\n');
  const indexOfSecondLine = indexofNewline === -1 ? originalValue.length : indexofNewline + 1;
  // TODO(prem): This is going to let completions start at the end of %python lines, etc.
  // https://github.com/Exafunction/Exafunction/pull/3652#discussion_r1102165558
  return { value: originalValue.substring(indexOfSecondLine), utf16Offset: indexOfSecondLine };
}

function createInlineCompletionItem(
  monacoSite: MonacoSite,
  completionItem: CompletionItem,
  document: monaco.editor.ITextModel,
  additionalUtf8ByteOffset: number,
  apiKey: string,
  editor?: monaco.editor.ICodeEditor
): monaco.languages.InlineCompletion | undefined {
  if (!completionItem.completion || !completionItem.range) {
    return undefined;
  }

  // Create and return inlineCompletionItem.
  const { value: text, utf16Offset } = getValueAndStartOffset(monacoSite, document);
  const startPosition = document.getPositionAt(
    utf16Offset +
      numUtf8BytesToNumCodeUnits(
        text,
        Number(completionItem.range.startOffset) - additionalUtf8ByteOffset
      )
  );
  const endPosition = document.getPositionAt(
    utf16Offset +
      numUtf8BytesToNumCodeUnits(
        text,
        Number(completionItem.range.endOffset) - additionalUtf8ByteOffset
      )
  );
  const range = new MonacoRange(startPosition, endPosition);
  let completionText = completionItem.completion.text;
  let callback: (() => void) | undefined = undefined;
  if (editor && completionItem.suffix && completionItem.suffix.text.length > 0) {
    // Add suffix to the completion text.
    completionText += completionItem.suffix.text;
    // Create callback to move cursor after accept.
    // Note that this is a hack to get around Monaco's API limitations.
    // There's no need to convert to code units since we only use simple characters.
    const deltaCursorOffset = Number(completionItem.suffix.deltaCursorOffset);
    callback = () => {
      const selection = editor.getSelection();
      if (selection === null) {
        console.warn('Unexpected, no selection');
        return;
      }
      const newPosition = document.getPositionAt(
        document.getOffsetAt(selection.getPosition()) + deltaCursorOffset
      );
      editor.setSelection(new MonacoRange(newPosition, newPosition));
      editor._commandService.executeCommand('editor.action.inlineSuggest.trigger');
    };
  }

  const inlineCompletionItem: monaco.languages.InlineCompletion = {
    insertText: completionText,
    text: completionText,
    range,
    command: {
      id: 'codeium.acceptCompletion',
      title: 'Accept Completion',
      arguments: [apiKey, completionItem.completion.completionId, callback],
    },
  };
  return inlineCompletionItem;
}

// We need to create a path that includes `.ipynb` as the suffix to trigger special logic in the language server.
function colabRelativePath(): string | undefined {
  const fileId = window.colab?.global.notebookModel.fileId;
  if (fileId === undefined) {
    return undefined;
  }
  if (fileId.source === 'drive') {
    return `${fileId.fileId}.ipynb`;
  }
  return fileId.fileId;
}

export class MonacoCompletionProvider implements monaco.languages.InlineCompletionsProvider {
  modelUriToEditor = new Map<string, monaco.editor.ICodeEditor>();
  client: LanguageServerClient;

  constructor(readonly extensionId: string, readonly monacoSite: MonacoSite) {
    this.client = new LanguageServerClient(extensionId);
  }

  getIdeInfo(): IdeInfo {
    if (window.colab !== undefined) {
      return {
        ideName: 'colab',
        ideVersion: window.colabVersionTag ?? 'unknown',
      };
    }
    return {
      ideName: 'monaco',
      ideVersion: `unknown-${window.location.hostname}`,
    };
  }

  textModels(model: monaco.editor.ITextModel): monaco.editor.ITextModel[] {
    if (this.monacoSite === OMonacoSite.COLAB) {
      return [...(window.colab?.global.notebookModel.singleDocument.models ?? [])];
    }
    if (this.monacoSite === OMonacoSite.DEEPNOTE) {
      const mainNotebookId = model.uri.toString().split(':')[0];
      const relevantEditors: monaco.editor.ICodeEditor[] = [];
      for (const [uri, editor] of this.modelUriToEditor) {
        const notebookId = uri.toString().split(':')[0];
        if (notebookId !== mainNotebookId) {
          continue;
        }
        relevantEditors.push(editor);
      }
      relevantEditors.sort(
        (a, b) =>
          (a.getDomNode()?.getBoundingClientRect().top ?? 0) -
          (b.getDomNode()?.getBoundingClientRect().top ?? 0)
      );
      return relevantEditors
        .map((editor) => editor.getModel())
        .filter((item): item is monaco.editor.ITextModel => item !== null);
    }
    return [];
  }

  private relativePath(): string | undefined {
    if (this.monacoSite === OMonacoSite.COLAB) {
      return colabRelativePath();
    }
    // TODO(prem): Adopt some convention for other sites.
  }

  private absolutePath(model: monaco.editor.ITextModel): string | undefined {
    // Given we are using path, note the docs on fsPath: https://microsoft.github.io/monaco-editor/api/classes/monaco.Uri.html#fsPath
    return model.uri.path;
    // TODO(prem): Adopt some site-specific convention.
  }

  private computeTextAndOffsets(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): TextAndOffsets {
    if (this.monacoSite === OMonacoSite.DATABRICKS) {
      // Because not all cells have models, we need to run computeTextAndOffsets on raw text.
      const rawTextModels = (window.notebook?.commandCollection().models ?? []).filter(
        (m) => m.attributes.type === 'command'
      ) as readonly DatabricksModel[];
      if (rawTextModels.length !== 0) {
        const textToModelMap = new Map<string, monaco.editor.ITextModel>();
        for (const editor of this.modelUriToEditor.values()) {
          const model = editor.getModel();
          if (model === null) {
            continue;
          }
          const value = getValueAndStartOffset(this.monacoSite, model).value;
          textToModelMap.set(value, model);
        }
        const editableRawTextModels = [...rawTextModels];
        editableRawTextModels.sort((a, b) => a.attributes.position - b.attributes.position);
        const rawTexts = editableRawTextModels.map((m) => m.attributes.command);
        // The raw texts haven't been updated with the most recent keystroke that triggered the completion, so let's swap in the newest string.
        const modelRawText = model.getValue();
        let best: { idx: number; length: number } | undefined = undefined;
        let bestBackspace: { idx: number; length: number } | undefined = undefined;
        for (const [i, text] of rawTexts.entries()) {
          if (modelRawText.startsWith(text)) {
            if (best === undefined || text.length > best.length) {
              best = { idx: i, length: text.length };
            }
          }
          if (text.startsWith(modelRawText)) {
            // The shortest one wins in this case.
            if (bestBackspace === undefined || text.length < bestBackspace.length) {
              bestBackspace = { idx: i, length: text.length };
            }
          }
        }
        if (best !== undefined) {
          rawTexts[best.idx] = modelRawText;
        } else if (bestBackspace !== undefined) {
          rawTexts[bestBackspace.idx] = modelRawText;
        }
        // TODO(prem): We can't actually tell between two models with the same text, do something more robust here.
        const valueAndStartOffset = getValueAndStartOffset(this.monacoSite, model);
        // computeTextAndOffsets is receiving shortened strings.
        return computeTextAndOffsets({
          textModels: rawTexts.map((m) => getValueAndStartOffset(this.monacoSite, m).value),
          currentTextModel: valueAndStartOffset.value,
          utf16CodeUnitOffset: model.getOffsetAt(position) - valueAndStartOffset.utf16Offset,
          getText: (text) => text,
          getLanguage: (text, idx) => {
            const model = textToModelMap.get(text);
            if (model !== undefined) {
              return getLanguage(getEditorLanguage(model));
            }
            if (idx !== undefined) {
              // This is useful for handling the %md case which has no model.
              text = rawTexts[idx];
            }
            if (text.startsWith('%sql')) {
              return Language.SQL;
            } else if (text.startsWith('%r')) {
              return Language.R;
            } else if (text.startsWith('%python')) {
              return Language.PYTHON;
            } else if (text.startsWith('%md')) {
              return Language.MARKDOWN;
            } else if (text.startsWith('%scala')) {
              return Language.SCALA;
            }
            return Language.UNSPECIFIED;
          },
        });
      }
    }
    return computeTextAndOffsets({
      textModels: this.textModels(model),
      currentTextModel: model,
      utf16CodeUnitOffset:
        model.getOffsetAt(position) - getValueAndStartOffset(this.monacoSite, model).utf16Offset,
      getText: (model) => getValueAndStartOffset(this.monacoSite, model).value,
      getLanguage: (model) => getLanguage(getEditorLanguage(model)),
    });
  }

  async provideInlineCompletions(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): Promise<monaco.languages.InlineCompletions | undefined> {
    const clientSettings = await this.client.clientSettingsPoller.clientSettings;
    if (clientSettings.apiKey === undefined) {
      return;
    }
    const apiKey = clientSettings.apiKey;

    const { text, utf8ByteOffset, additionalUtf8ByteOffset } = this.computeTextAndOffsets(
      model,
      position
    );
    const numUtf8Bytes = additionalUtf8ByteOffset + utf8ByteOffset;
    const request = new GetCompletionsRequest({
      metadata: this.client.getMetadata(this.getIdeInfo(), apiKey),
      document: {
        text: text,
        editorLanguage: getEditorLanguage(model),
        language: getLanguage(getEditorLanguage(model)),
        cursorOffset: BigInt(numUtf8Bytes),
        lineEnding: '\n',
        relativePath: this.relativePath(),
        absolutePath: this.absolutePath(model),
      },
      editorOptions: {
        tabSize: BigInt(model.getOptions().tabSize),
        insertSpaces: model.getOptions().insertSpaces,
      },
      modelName: clientSettings.defaultModel,
    });
    const response = await this.client.getCompletions(request);
    if (response === undefined) {
      return;
    }
    const items = response.completionItems
      .map((completionItem) =>
        createInlineCompletionItem(
          this.monacoSite,
          completionItem,
          model,
          additionalUtf8ByteOffset,
          apiKey,
          this.modelUriToEditor.get(model.uri.toString())
        )
      )
      .filter((item): item is monaco.languages.InlineCompletion => item !== undefined);
    await chrome.runtime.sendMessage(this.extensionId, { type: 'success' });
    return { items };
  }

  handleItemDidShow(): void {
    // Do nothing.
  }

  freeInlineCompletions(): void {
    // Do nothing.
  }

  addEditor(editor: monaco.editor.ICodeEditor): void {
    if (this.monacoSite !== OMonacoSite.DATABRICKS) {
      editor.updateOptions({ inlineSuggest: { enabled: true } });
    }
    const uri = editor.getModel()?.uri.toString();
    if (uri !== undefined) {
      this.modelUriToEditor.set(uri, editor);
    }
    editor.onDidChangeModel((e) => {
      const oldUri = e.oldModelUrl?.toString();
      if (oldUri !== undefined) {
        this.modelUriToEditor.delete(oldUri);
      }
      const newUri = e.newModelUrl?.toString();
      if (newUri !== undefined) {
        this.modelUriToEditor.set(newUri, editor);
      }
    });
    if (this.monacoSite === OMonacoSite.DEEPNOTE) {
      // Hack to intercept the key listener.
      (editor as any).onKeyDown = wrapOnKeyDown(editor.onKeyDown);
    }
  }

  async acceptedLastCompletion(apiKey: string, completionId: string): Promise<void> {
    await this.client.acceptedLastCompletion(this.getIdeInfo(), apiKey, completionId);
  }
}

function wrapOnKeyDownListener(
  listener: (e: monaco.IKeyboardEvent) => any
): (e: monaco.IKeyboardEvent) => any {
  return function (e: monaco.IKeyboardEvent): any {
    if (e.browserEvent.key === 'Tab') {
      return;
    }
    return listener(e);
  };
}

function wrapOnKeyDown(
  onKeyDown: (
    this: monaco.editor.ICodeEditor,
    listener: (e: monaco.IKeyboardEvent) => any,
    thisArg?: any
  ) => void
): (
  this: monaco.editor.ICodeEditor,
  listener: (e: monaco.IKeyboardEvent) => any,
  thisArg?: any
) => void {
  return function (
    this: monaco.editor.ICodeEditor,
    listener: (e: monaco.IKeyboardEvent) => any,
    thisArg?: any
  ): void {
    onKeyDown.call(this, wrapOnKeyDownListener(listener), thisArg);
  };
}
