import type { Extension } from "@codemirror/state";
import { extname } from "./path";

/**
 * 按扩展名懒加载 CodeMirror 语言包。
 *
 * 关键点：语言包用动态 import，主包体积不包含所有 grammar。
 * 打开一个 .ts 文件才下载 TS grammar，避免首屏加载十几种语言。
 */
type LanguageLoader = () => Promise<Extension>;

const loaders: Record<string, LanguageLoader> = {
  js: async () => (await import("@codemirror/lang-javascript")).javascript(),
  jsx: async () => (await import("@codemirror/lang-javascript")).javascript({ jsx: true }),
  ts: async () => (await import("@codemirror/lang-javascript")).javascript({ typescript: true }),
  tsx: async () =>
    (await import("@codemirror/lang-javascript")).javascript({ jsx: true, typescript: true }),
  mjs: async () => (await import("@codemirror/lang-javascript")).javascript(),
  cjs: async () => (await import("@codemirror/lang-javascript")).javascript(),
  json: async () => (await import("@codemirror/lang-json")).json(),
  jsonc: async () => (await import("@codemirror/lang-json")).json(),
  css: async () => (await import("@codemirror/lang-css")).css(),
  html: async () => (await import("@codemirror/lang-html")).html(),
  htm: async () => (await import("@codemirror/lang-html")).html(),
  vue: async () => (await import("@codemirror/lang-html")).html(),
  md: async () => (await import("@codemirror/lang-markdown")).markdown(),
  markdown: async () => (await import("@codemirror/lang-markdown")).markdown(),
  py: async () => (await import("@codemirror/lang-python")).python(),
  sql: async () => (await import("@codemirror/lang-sql")).sql(),
};

/** 无需 grammar 即可正确着色、按纯文本编辑的类型。 */
const plainTextExtensions = new Set([
  "txt", "log", "mdx", "env", "gitignore", "editorconfig", "lock", "yaml", "yml", "toml", "ini",
]);

export async function resolveLanguage(path: string): Promise<Extension[]> {
  const ext = extname(path);

  // HTML 系语言同时需要内嵌 script/style 支持
  if (ext === "vue") {
    try {
      return [
        await import("@codemirror/lang-html").then((m) =>
          m.html({ matchClosingTags: true, autoCloseTags: true }),
        ),
      ];
    } catch {
      return [];
    }
  }

  const loader = loaders[ext];
  if (loader) {
    try {
      return [await loader()];
    } catch {
      // 语言包加载失败不应阻断编辑，降级为纯文本
      return [];
    }
  }

  if (plainTextExtensions.has(ext)) return [];
  return [];
}

/** 供语法高亮下拉框使用的可选语言清单。 */
export const SUPPORTED_LANGUAGES = [
  { label: "Plain Text", value: "" },
  { label: "TypeScript", value: "ts" },
  { label: "JavaScript", value: "js" },
  { label: "JSX", value: "jsx" },
  { label: "TSX", value: "tsx" },
  { label: "JSON", value: "json" },
  { label: "HTML", value: "html" },
  { label: "Vue", value: "vue" },
  { label: "CSS", value: "css" },
  { label: "SCSS", value: "scss" },
  { label: "Markdown", value: "md" },
  { label: "Python", value: "py" },
  { label: "SQL", value: "sql" },
] as const;
