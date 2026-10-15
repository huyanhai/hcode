<template>
  <TreeRoot
    class="min-h-0 flex-1 overflow-auto bg-accent pt-2"
    :items="items"
    :get-key="getKey"
    :get-children="getChildren"
    :expanded="expanded"
    :model-value="selectedItem"
    selection-behavior="replace"
    @update:expanded="onExpandedUpdate"
  >
    <TreeVirtualizer
      v-slot="{ item }"
      :estimate-size="rowHeight"
      :overscan="overscan"
    >
      <TreeItem
        :value="item.value"
        :level="item.level"
        :style="{
          width: '100%',
        }"
        @select="onSelect"
        @contextmenu.prevent="
          emit('contextmenu', { event: $event, node: asNode(item.value) })
        "
        class="px-2! group"
      >
        <template #default="{ isExpanded }">
          <Button
            class="w-full flex justify-start items-center group-aria-selected:bg-background hover:bg-background"
            variant="ghost"
            :style="{
              height: rowHeight + 'px',
              paddingLeft: `${(item.level - 1) * 8 + 8}px`,
            }"
          >
            <Icon
              :icon="iconName(asNode(item.value), isExpanded)"
              width="14"
              height="14"
            />

            <span class="truncate">{{ item.value.name }}</span>
          </Button>
        </template>
      </TreeItem>
    </TreeVirtualizer>
  </TreeRoot>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  TreeItem,
  TreeRoot,
  TreeVirtualizer,
  type TreeItemSelectEvent,
} from "reka-ui";
import { ChevronRight, Loader2 } from "lucide-vue-next";
import { Icon } from "@iconify/vue/offline";
import type { FileNode } from "../types";
import { resolveDirIcon, resolveFileIcon } from "../constants/icons";

/**
 * 目录树。
 *
 * 结构与展开/收起、键盘导航、虚拟滚动全部交给 reka-ui 的 Tree：
 * - `TreeRoot` 负责展开态与 roving focus（上下键、左右键、typeahead）；
 * - `TreeVirtualizer` 按可视区裁剪渲染，替代原先手写的窗口裁剪；
 * - `TreeItem` 提供 `treeitem` 角色与 aria 属性。
 *
 * 本组件只负责「长什么样」和「点击做什么」，展开状态由外部（store）持有。
 */
const props = withDefaults(
  defineProps<{
    items: FileNode[];
    /** 已展开的目录路径，受控。 */
    expanded: string[];
    /** 当前激活（已打开）的文件路径。 */
    activePath: string;
    /** 正在懒加载子节点的目录，用于展示转圈。 */
    loadingPaths?: ReadonlySet<string>;
    /** 行高，同时作为虚拟滚动的估算尺寸。 */
    rowHeight?: number;
    /** 视口外额外渲染的行数，避免快速滚动时露白。 */
    overscan?: number;
  }>(),
  { loadingPaths: () => new Set<string>(), rowHeight: 24, overscan: 10 },
);

const emit = defineEmits<{
  (event: "update:expanded", paths: string[]): void;
  (event: "open", path: string): void;
  (event: "contextmenu", payload: { event: MouseEvent; node: FileNode }): void;
}>();

/** 路径天然唯一，直接作为节点 key。 */
const getKey = (node: FileNode): string => node.path;

/**
 * reka 用 `children` 是否存在判断节点能否展开，且要求返回 `T[] | undefined`。
 * store 里文件是 `null`、未加载的目录是 `[]`，这里统一成 reka 期望的形态。
 */
const getChildren = (node: FileNode): FileNode[] | undefined =>
  node.type === "directory" ? (node.children ?? []) : undefined;

/**
 * 选中态。
 *
 * 只有「已打开的文件」才算激活项，所以喂给 reka 的 modelValue 用不落库的
 * 影子对象即可 —— `getKey` 只读 `path`，不需要构造完整节点。
 * 真实选中变化由 store 的 activePath 驱动（见 file-manager）。
 */
const selectedItem = computed(() => ({ path: props.activePath }));

/** reka 的虚拟列表把节点类型擦成 `Record<string, any>`，这里收回真实类型。 */
function asNode(value: Record<string, any>): FileNode {
  return value as FileNode;
}

/**
 * 点击/回车一项时触发。
 *
 * 默认行为是把它写进 reka 自己的 modelValue，但我们的选中态由 store 托管，
 * 于是拦掉；目录的展开收起仍走 reka（它随后会 emit update:expanded）。
 */
function onSelect(event: TreeItemSelectEvent<Record<string, any>>): void {
  event.preventDefault();
  const value = event.detail.value;
  if (!value) return;
  const node = asNode(value);
  if (node.type === "file") emit("open", node.path);
}

function onExpandedUpdate(paths: string[]): void {
  emit("update:expanded", paths);
}

/**
 * 节点 → 图标名。
 *
 * 具体的文件名/扩展名/目录名映射集中在 `./icons`，这里只做目录与文件的分派。
 */
function iconName(node: FileNode, isExpanded: boolean): string {
  return node.type === "directory"
    ? resolveDirIcon(node.name, isExpanded)
    : resolveFileIcon(node.name);
}
</script>

<style scoped>
.fm-tree {
  font-size: 13px;
  user-select: none;
}

.fm-row {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  white-space: nowrap;
  color: var(--fm-fg-muted, #6b7280);
}

.fm-row:hover {
  background: var(--fm-hover, rgba(0, 0, 0, 0.04));
}

/* reka 在选中项上打 data-selected，选中态统一由 CSS 表达 */
.fm-row[data-selected] {
  background: var(--fm-active, rgba(59, 130, 246, 0.12));
  color: var(--fm-fg, #111827);
}

.fm-twisty {
  display: inline-flex;
  width: 14px;
  flex: 0 0 14px;
}

.fm-chevron {
  transition: transform 0.15s ease;
}

.fm-chevron.is-open {
  transform: rotate(90deg);
}

.fm-icon {
  flex: 0 0 14px;
}

.fm-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.fm-spin {
  flex: 0 0 14px;
  animation: fm-rotate 1s linear infinite;
}

@keyframes fm-rotate {
  to {
    transform: rotate(360deg);
  }
}
</style>
