import type CodeMirror from 'codemirror';

import { Language } from '../proto/exa/codeium_common_pb/codeium_common_pb';

// https://github.com/codemirror/codemirror5/blob/9e864a1bb7c4c452f462d7f8d8be111c8bb8ad6f/mode/meta.js

const MIME_MAP = new Map<string, Language>([
  // mode: clike
  ['text/x-csrc', Language.C],
  ['text/x-c++src', Language.CPP],
  ['text/x-csharp', Language.CSHARP],
  ['text/x-java', Language.JAVA],
  ['text/x-kotlin', Language.KOTLIN],
  ['text/x-objectivec', Language.OBJECTIVEC],
  ['text/x-objectivec++', Language.OBJECTIVECPP],
  ['text/x-scala', Language.SCALA],
  // mode: css
  ['text/css', Language.CSS],
  ['text/x-less', Language.LESS],
  ['text/x-sass', Language.SASS],
  ['text/x-scss', Language.SCSS],
  // mode: javascript
  ['application/json', Language.JSON],
  ['application/x-json', Language.JSON],
  ['application/ld+json', Language.JSON],
  ['application/typescript', Language.TYPESCRIPT],
  // mode: jsx
  ['text/jsx', Language.JAVASCRIPT], // We (and tree-sitter) don't have a separate JSX.
  ['text/typescript-jsx', Language.TSX],
  // mode: mllike
  ['text/x-ocaml', Language.OCAML],
  // Jupyterlab specific
  ['text/x-ipython', Language.PYTHON],
]);

const MODE_MAP = new Map<string, Language>([
  ['clojure', Language.CLOJURE],
  ['coffeescript', Language.COFFEESCRIPT],
  ['python', Language.PYTHON], // Includes Cython.
  ['sql', Language.SQL], // Includes Cassandra, MariaDB, MS SQL, MySQL, PLSQL, PostgreSQL, SQL, SQLite.
  ['dart', Language.DART],
  ['gfm', Language.MARKDOWN],
  ['go', Language.GO],
  ['groovy', Language.GROOVY],
  ['haskell', Language.HASKELL],
  ['haskell-literate', Language.HASKELL], // TODO(prem): Should this be different?
  ['htmlmixed', Language.HTML], // Includes handlebars.
  ['javascript', Language.JAVASCRIPT],
  ['julia', Language.JULIA],
  ['lua', Language.LUA],
  ['markdown', Language.MARKDOWN],
  ['perl', Language.PERL],
  ['php', Language.PHP],
  ['null', Language.PLAINTEXT],
  ['protobuf', Language.PROTOBUF],
  ['r', Language.R],
  ['rst', Language.RST],
  ['ruby', Language.RUBY],
  ['rust', Language.RUST],
  ['shell', Language.SHELL],
  ['swift', Language.SWIFT],
  ['stex', Language.LATEX],
  ['toml', Language.TOML],
  ['vue', Language.VUE],
  ['xml', Language.XML],
  ['yaml', Language.YAML],
  // Special cases.
  ['ipython', Language.PYTHON],
  ['ipythongfm', Language.MARKDOWN],
]);

const FILENAME_MAP = new Map<RegExp, Language>([
  // These are special entries because the mime/mode are the same as Python.
  [/^BUILD$/, Language.STARLARK],
  [/^.+\.bzl$/, Language.STARLARK],
]);

function getMode(doc: CodeMirror.Doc): { name: string } {
  if (doc.getMode() !== undefined) {
    return doc.getMode() as { name: string };
  }
  return doc.modeOption as { name: string };
}

// Note that this cannot be mapped directly into the Language enum.
export function editorLanguage(doc: CodeMirror.Doc): string {
  return getMode(doc).name;
}

export function language(doc: CodeMirror.Doc, path: string | undefined): Language {
  if (path !== undefined) {
    const basename = path.split('/').pop() ?? '';
    // Iterate over FILENAME_MAP for a match.
    for (const [regex, language] of FILENAME_MAP) {
      if (regex.test(basename)) {
        return language;
      }
    }
  }
  const mime = doc.getEditor()?.getOption('mode') ?? doc.modeOption;
  if (typeof mime === 'string') {
    const language = MIME_MAP.get(mime);
    if (language !== undefined) {
      return language;
    }
  }
  return MODE_MAP.get(getMode(doc).name) ?? Language.UNSPECIFIED;
}
