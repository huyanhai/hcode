# @hcode/file-manager

工作区文件管理模块：目录树 + 多标签 + 在线编辑。桌面端（Electron）与 Web 端共用同一套 UI。

## 设计要点

**1. UI 与数据源解耦**

组件层只依赖 `FileProvider` 接口，不关心数据来自本地磁盘还是远端服务：

```
FileTree / FileEditor / FileTabs   ← 只认 FileProvider 接口
        ↓
   useFileManagerStore             ← 树状态、懒加载、脏检查、冲突检测
        ↓
   FileProvider（可替换）
     ├── ElectronFileProvider      → window.desktop.fs → 主进程 node:fs
     └── HttpFileProvider          → fetch /api/files → NestJS FilesService
```

**2. 目录树懒加载 + 虚拟滚动**

- 展开时才加载子节点（`store.toggle`），大仓库首屏只拉根目录。
- `flatRows` 把树拍平成可见行列表，配合固定行高做窗口裁剪。
  目录树动辄上万节点，递归渲染会明显卡顿，因此不用递归组件。
- 默认忽略 `.git` / `node_modules` / `dist` / `*.lock` 等噪声。

**3. 编辑器**

- CodeMirror 6，语言包按扩展名**动态 import**，打开 `.ts` 才下载 TS grammar。
- 用 `Compartment` 切换语言：切换文件时只重配 compartment，不重建编辑器实例。
- 主题全部走 CSS 变量（`--fm-*`），跟随宿主明暗主题，不硬编码配色。

**4. 修改冲突**

编辑器场景里最容易踩的坑，已在 store 层处理：

- **脏检查**：对比 `content` 与 `savedContent`，标签页显示圆点。
- **外部修改检测**：打开时记录 `mtimeMs`，保存前复查磁盘时间戳，
  期间被外部程序改动则拒绝写入并标记冲突。
- **外部变更监听**：`provider.watch` 订阅变更，200ms 合并高频事件。
  未打开的文件静默刷新树；已打开且有本地改动时标记冲突而非静默覆盖。
- 关闭窗口时 `beforeunload` 拦截未保存改动。

## 在 Electron 中使用

主进程已注册 `fs:*` IPC，preload 已暴露 `window.desktop.fs`：

```vue
<script setup lang="ts">
import { ref } from "vue";
import { FileManager, ElectronFileProvider } from "@hcode/file-manager";

const root = ref("");
const provider = new ElectronFileProvider("工作区");

async function chooseWorkspace() {
  root.value = (await window.desktop!.selectDirectory()) ?? "";
}
</script>

<template>
  <button @click="chooseWorkspace">选择目录</button>
  <FileManager v-if="root" :provider="provider" :root="root" />
</template>
```

## 在 Web 中使用

```ts
import { FileManager, HttpFileProvider } from "@hcode/file-manager";

const provider = new HttpFileProvider({
  baseUrl: "/api/files",
  rootLabel: "项目",
});
```

服务端需注册授权根目录（工作区创建时会自动注册）：

```ts
filesService.registerRoot("/Users/me/projects/my-app");
```

未注册任何根目录时，所有路径请求返回 403 —— 默认拒绝优于默认放行。

## 主题变量

| 变量 | 用途 | 默认值 |
| --- | --- | --- |
| `--fm-editor-bg` | 编辑区背景 | `#ffffff` |
| `--fm-editor-fg` | 编辑区文字 | `#1f2937` |
| `--fm-fg` / `--fm-fg-muted` | 主文字 / 次要文字 | `#111827` / `#6b7280` |
| `--fm-sidebar-bg` / `--fm-tabs-bg` | 侧栏 / 标签栏背景 | `#fafafa` / `#f3f4f6` |
| `--fm-border` | 边框 | `#e5e7eb` |
| `--fm-active` / `--fm-hover` | 选中 / 悬停背景 | — |
| `--fm-danger` | 冲突与错误提示 | `#dc2626` |
| `--fm-mono` | 等宽字体 | 系统 mono |

## 安全边界

文件操作全部发生在主进程 / 服务端，渲染进程只发请求。两侧实现同一套约束：

1. 路径必须落在授权根目录内，越界直接抛错；
2. **不跟随符号链接**（跳过 `isSymbolicLink()` 的条目），防止链接指向根目录之外；
3. 删除目录必须显式传 `recursive`，否则拒绝；
4. 不允许删除根目录自身；
5. `write(overwrite=false)` 用于「新建文件」，文件已存在时报错而非静默覆盖。

需要放开限制时，客户端调 `setAllowedRoots([])`、服务端调 `registerRoot()`，
但生产环境建议保持白名单。

## API

```ts
interface FileProvider {
  readonly rootLabel: string;
  list(options: { path: string; recursive?: boolean; ignore?: string[] }): Promise<FileNode[]>;
  read(path: string): Promise<string>;
  write(options: { path: string; content: string; overwrite?: boolean }): Promise<void>;
  rename(options: { path: string; newPath: string }): Promise<void>;
  remove(options: { path: string; recursive?: boolean }): Promise<void>;
  mkdir(path: string): Promise<void>;
  watch?(paths: string[], onChange: (paths: string[]) => void): () => void;
}
```

路径统一使用 `/` 分隔，由 provider 归一化，前端无需处理平台差异。
