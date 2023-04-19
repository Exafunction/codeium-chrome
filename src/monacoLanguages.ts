import { Language } from '../proto/exa/codeium_common_pb/codeium_common_pb';

// Map from VSCode language to Codeium language.
// Languages from https://code.visualstudio.com/docs/languages/identifiers
const LANGUAGE_MAP = new Map<string, Language>([
  ['bazel', Language.STARLARK],
  ['c', Language.C],
  ['clojure', Language.CLOJURE],
  ['coffeescript', Language.COFFEESCRIPT],
  ['cpp', Language.CPP],
  ['csharp', Language.CSHARP],
  ['css', Language.CSS],
  ['cuda-cpp', Language.CUDACPP],
  ['dockerfile', Language.DOCKERFILE],
  ['go', Language.GO],
  ['groovy', Language.GROOVY],
  ['handlebars', Language.HANDLEBARS],
  ['haskell', Language.HASKELL],
  ['html', Language.HTML],
  ['ini', Language.INI],
  ['java', Language.JAVA],
  ['javascript', Language.JAVASCRIPT],
  ['javascriptreact', Language.JAVASCRIPT],
  ['json', Language.JSON],
  ['jsonc', Language.JSON],
  ['jsx', Language.JAVASCRIPT],
  ['julia', Language.JULIA],
  ['kotlin', Language.KOTLIN],
  ['latex', Language.LATEX],
  ['less', Language.LESS],
  ['lua', Language.LUA],
  ['makefile', Language.MAKEFILE],
  ['markdown', Language.MARKDOWN],
  ['objective-c', Language.OBJECTIVEC],
  ['objective-cpp', Language.OBJECTIVECPP],
  ['pbtxt', Language.PBTXT],
  ['perl', Language.PERL],
  ['pgsql', Language.SQL],
  ['php', Language.PHP],
  ['plaintext', Language.PLAINTEXT],
  ['proto3', Language.PROTOBUF],
  ['python', Language.PYTHON],
  ['r', Language.R],
  ['ruby', Language.RUBY],
  ['rust', Language.RUST],
  ['sass', Language.SASS],
  ['scala', Language.SCALA],
  ['scss', Language.SCSS],
  ['shellscript', Language.SHELL],
  ['sql', Language.SQL],
  ['swift', Language.SWIFT],
  ['terraform', Language.HCL],
  ['typescript', Language.TYPESCRIPT],
  ['typescriptreact', Language.TSX],
  ['vb', Language.VISUALBASIC],
  ['vue-html', Language.VUE],
  ['vue', Language.VUE],
  ['xml', Language.XML],
  ['xsl', Language.XSL],
  ['yaml', Language.YAML],
  // Special cases.
  ['notebook-python', Language.PYTHON], // colab
  ['notebook-python-lsp', Language.PYTHON], // colab
]);

export function getLanguage(language: string): Language {
  return LANGUAGE_MAP.get(language) ?? Language.UNSPECIFIED;
}
