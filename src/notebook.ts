import { numCodeUnitsToNumUtf8Bytes } from './utf';
import { Language } from '../proto/exa/codeium_common_pb/codeium_common_pb';

export interface TextAndOffsets {
  // The smart concatenation of all notebook cells, or just the text of the main document.
  text: string;
  // The offset into the current cell/document.
  utf8ByteOffset: number;
  // Any additional offset induced by the smart concatenation.
  additionalUtf8ByteOffset: number;
}

const NOTEBOOK_LANGUAGES = {
  [Language.PYTHON]: 'python',
  [Language.SQL]: 'sql',
  [Language.R]: '', // Not supported by GFM.
  [Language.MARKDOWN]: 'markdown',
  [Language.SCALA]: '', // Not supported by GFM.
} as const;
type AllowedLanguages = keyof typeof NOTEBOOK_LANGUAGES;

function isAllowedLanguage(language: Language) {
  return Object.prototype.hasOwnProperty.call(NOTEBOOK_LANGUAGES, language);
}

// In Jupyter, we can have cells which are neither Markdown nor Python, so we
// need to define both functions in the interface.
export interface MaybeNotebook<T> {
  readonly textModels: T[];
  readonly currentTextModel: T;
  // The offset into the value of getText(currentTextModel) at which to trigger a completion.
  readonly utf16CodeUnitOffset: number;
  getText(model: T): string;
  // idx is the position in the textModels array, or undefined if it's the currentTextModel.
  getLanguage(model: T, idx: number | undefined): Language;
}

// Note: Assumes that all notebooks are Python.
export function computeTextAndOffsets<T>(maybeNotebook: MaybeNotebook<T>): TextAndOffsets {
  const textModels = maybeNotebook.textModels ?? [];
  const modelLanguage = maybeNotebook.getLanguage(maybeNotebook.currentTextModel, undefined);
  const modelIsMarkdown = modelLanguage === Language.MARKDOWN;
  const modelIsExpected = isAllowedLanguage(modelLanguage);
  const relevantDocumentTexts: string[] = [];
  let additionalUtf8ByteOffset = 0;
  let found = false;
  for (const [idx, previousModel] of textModels.entries()) {
    if (modelIsExpected && maybeNotebook.currentTextModel === previousModel) {
      // There is an offset for all previous cells and the \n\n spacing after each one.
      additionalUtf8ByteOffset =
        relevantDocumentTexts
          .map((el) => numCodeUnitsToNumUtf8Bytes(el))
          .reduce((a, b) => a + b, 0) +
        '\n\n'.length * relevantDocumentTexts.length;
      found = true;
    }
    const previousModelLanguage = maybeNotebook.getLanguage(previousModel, idx);
    if (modelIsExpected && !modelIsMarkdown) {
      // Don't use markdown in the Python prompt construction.
      // TODO(prem): Consider adding as comments.
      if (previousModelLanguage === Language.MARKDOWN) {
        continue;
      } else if (previousModelLanguage === modelLanguage) {
        relevantDocumentTexts.push(maybeNotebook.getText(previousModel));
      }
    } else if (modelIsMarkdown) {
      if (previousModelLanguage === Language.MARKDOWN) {
        relevantDocumentTexts.push(maybeNotebook.getText(previousModel));
      } else if (isAllowedLanguage(previousModelLanguage)) {
        relevantDocumentTexts.push(
          `\`\`\`${
            NOTEBOOK_LANGUAGES[previousModelLanguage as AllowedLanguages]
          }\n${maybeNotebook.getText(previousModel)}\n\`\`\``
        );
      }
    }
  }
  const currentModelText = maybeNotebook.getText(maybeNotebook.currentTextModel);
  const text = found ? relevantDocumentTexts.join('\n\n') : currentModelText;
  const utf8ByteOffset = numCodeUnitsToNumUtf8Bytes(
    currentModelText,
    maybeNotebook.utf16CodeUnitOffset
  );
  return {
    text,
    utf8ByteOffset,
    additionalUtf8ByteOffset,
  };
}
