/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

/**
 * preload 通过 contextBridge 暴露的 `window.desktop`。
 * 这里只声明文件管理模块用到的 `fs` 子命名空间。
 */
export interface DesktopFsBridge {
  list(path: string, recursive?: boolean): Promise<FileNodeDto[]>;
  read(path: string): Promise<string>;
  write(path: string, content: string, create?: boolean): Promise<void>;
  rename(path: string, newPath: string): Promise<void>;
  remove(path: string, recursive?: boolean): Promise<void>;
  mkdir(path: string): Promise<void>;
}

export interface FileNodeDto {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  mtimeMs: number;
}

declare global {
  interface Window {
    desktop?: {
      fs?: DesktopFsBridge;
    };
  }
}

export {};
