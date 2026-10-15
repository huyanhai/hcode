export { default as FileManager } from "./components/FileManager.vue";
export { default as FileTree } from "./components/FileTree.vue";
export { default as FileEditor } from "./components/FileEditor.vue";
export { default as FileTabs } from "./components/FileTabs.vue";

export { useFileManagerStore } from "./store";
export type { FlatRow, OpenFile } from "./store";

export { ElectronFileProvider } from "./providers/electron";
export { HttpFileProvider } from "./providers/http";
export type { HttpFileProviderOptions } from "./providers/http";

export { isBinaryPath } from "./types";
export type {
  FileNode,
  FileProvider,
  ListOptions,
  WriteOptions,
  RenameOptions,
  RemoveOptions,
} from "./types";

export {
  basename,
  dirname,
  extname,
  formatRelativeTime,
  formatSize,
  isInside,
  joinPath,
} from "./utils/path";
export { resolveLanguage, SUPPORTED_LANGUAGES } from "./utils/language";
