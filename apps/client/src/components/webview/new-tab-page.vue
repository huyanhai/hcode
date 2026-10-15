<template>
  <div class="w-full h-full overflow-y-auto bg-muted px-4 py-4">
    <div class="mx-auto w-full max-w-3xl">
      <h2 class="text-md font-medium text-foreground">工具</h2>
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button
          v-for="tool in tools"
          :key="tool.id"
          variant="outline"
          size="lg"
          @click="emit('select', tool.id)"
          class="flex justify-between px-2 border-0 opacity-50 hover:opacity-100!"
        >
          <div class="flex items-center gap-1">
            <component :is="tool.icon" class="size-4" />
            <span class="flex-1 truncate text-sm">{{ tool.label }}</span>
          </div>
          <KbdGroup>
            <Kbd v-for="value in tool.shortcut.split('')" :key="value">{{
              value
            }}</Kbd>
          </KbdGroup>
        </Button>
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import {
  FolderOpen,
  MessageCirclePlus,
  SquarePlus,
  SquareTerminal,
} from "@lucide/vue";
import Button from "@/components/ui/button/Button.vue";
import { useDesktop } from "@/hooks/useDesktop.js";
import { KbdGroup, Kbd } from "../ui/kbd/index";

/**
 * 新标签页起始页：无网址时替代 webview 渲染。
 * 工具卡片只负责抛出 id，具体行为（打开变更面板 / 终端等）由宿主决定。
 */
const allTools = [
  { id: "changes", label: "变更", shortcut: "^⇧G", icon: SquarePlus },
  { id: "terminal", label: "终端", shortcut: "^`", icon: SquareTerminal },
  { id: "files", label: "文件", shortcut: "⌘P", icon: FolderOpen },
  {
    id: "side-chat",
    label: "侧边聊天",
    shortcut: "⌥⌘S",
    icon: MessageCirclePlus,
  },
] as const;

const { isDesktop } = useDesktop();

/**
 * 「文件」面板靠 Electron IPC 直读本地磁盘，浏览器里没有可去之处，
 * 因此非桌面端直接从工具列表里摘掉，避免点开一个空面板。
 */
const tools = computed(() =>
  allTools.filter((tool) => isDesktop.value || tool.id !== "files"),
);

const emit = defineEmits<{ select: [tool: string] }>();
//#region Props
//#endregion
//#region Emits
//#endregion
//#region Hooks
//#endregion
//#region Computed
//#endregion
//#region Watch
//#endregion
//#region Event
//#endregion
//#region Function
//#endregion
//#region Life Cycle
//#endregion
//#region Expose
//#endregion
</script>
