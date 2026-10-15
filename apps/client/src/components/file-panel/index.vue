<script setup lang="ts">
import { computed, ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { useLocalStorage } from "@vueuse/core";
import { FolderOpen, LoaderCircle } from "@lucide/vue";
import {
  ElectronFileProvider,
  FileManager,
  HttpFileProvider,
} from "@hcode/file-manager";
import type { FileProvider } from "@hcode/file-manager";
// 组件库样式（vite lib 模式不自动注入，宿主需显式引入）
import "@hcode/file-manager/style.css";
import {
  listWorkspaces,
  type WorkspaceSummary,
} from "@/lib/model-profiles-api";

/**
 * 文件面板：右侧栏「文件」工具的内容组件。
 *
 * 职责只有两个：
 * 1. 解析「当前项目」的根目录 —— 取左侧面板选中的工作区的主要文件夹；
 *    没选项目时允许手动指定目录（仅桌面端）。
 * 2. 按运行环境选择数据源：Electron 走 IPC 直读本地磁盘，Web 走 server 文件接口。
 *
 * 根目录变化时通过 :key 重建 FileManager，天然重置树/标签页状态。
 */
const selectedWorkspaceId = useLocalStorage<string>(
  "hcode:selected-workspace-id",
  "",
);
const workspacesQuery = useQuery<WorkspaceSummary[]>({
  queryKey: ["workspaces"],
  queryFn: listWorkspaces,
});

const currentWorkspace = computed<WorkspaceSummary | null>(
  () =>
    workspacesQuery.data.value?.find(
      (workspace) => workspace.id === selectedWorkspaceId.value,
    ) ?? null,
);

/** 工作区根目录：主要文件夹优先，其次第一个文件夹，最后退到工作区主路径 */
function resolveWorkspaceRoot(workspace: WorkspaceSummary | null): string {
  if (!workspace) return "";
  const folders = workspace.folders ?? [];
  return (
    folders.find((folder) => folder.isPrimary)?.path ??
    folders[0]?.path ??
    workspace.path ??
    ""
  );
}

/** 手动选择的目录（桌面端兜底：没选项目也能直接浏览某个目录） */
const manualRoot = ref("");
const root = computed(
  () => resolveWorkspaceRoot(currentWorkspace.value) || manualRoot.value,
);

const isDesktop = Boolean(window.desktop);

const provider = computed<FileProvider | null>(() => {
  if (!root.value) return null;
  const label = currentWorkspace.value?.name ?? "文件";
  if (window.desktop?.fs) return new ElectronFileProvider(label);
  return new HttpFileProvider({ baseUrl: "/api/files", rootLabel: label });
});

async function pickRoot() {
  try {
    const dir = await window.desktop?.selectDirectory();
    if (dir) manualRoot.value = dir;
  } catch (error) {
    console.error("[file-panel] 选择目录失败", error);
  }
}
</script>

<template>
  <div class="h-full min-h-0 bg-background">
    <FileManager
      v-if="root && provider"
      :key="root"
      :provider="provider"
      :root="root"
      watch
    />
    <div
      v-else
      class="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"
    >
      <template v-if="workspacesQuery.isLoading.value">
        <LoaderCircle class="size-5 animate-spin" />
        <span class="text-sm">正在加载项目…</span>
      </template>
      <template v-else>
        <FolderOpen class="size-8 opacity-50" />
        <span class="text-sm">当前没有打开的项目</span>
        <span class="max-w-60 text-center text-xs opacity-75">
          在左侧面板选择一个项目后，这里会自动打开项目根目录
        </span>
        <button
          v-if="isDesktop"
          type="button"
          class="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          @click="pickRoot"
        >
          选择目录…
        </button>
      </template>
    </div>
  </div>
</template>
