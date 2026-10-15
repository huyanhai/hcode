<script setup lang="ts">
import { computed, ref } from "vue";
import {
  ChevronRight,
  File as FileIcon,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
} from "lucide-vue-next";
import type { FlatRow } from "../store";
import { extname } from "../utils/path";

const props = withDefaults(
  defineProps<{
    rows: FlatRow[];
    activePath: string;
    rowHeight?: number;
    /** 视口外额外渲染的行数，避免快速滚动时露白。 */
    overscan?: number;
  }>(),
  { rowHeight: 24, overscan: 10 },
);

const emit = defineEmits<{
  (event: "toggle", path: string): void;
  (event: "open", path: string): void;
  (event: "contextmenu", payload: { event: MouseEvent; node: FlatRow["node"] }): void;
}>();

const scrollTop = ref(0);
const viewportHeight = ref(400);

/**
 * 虚拟滚动：只渲染可视区内的行。
 *
 * 目录树可能有上万节点（node_modules 未忽略干净时更甚），
 * 全量渲染会明显卡顿，这里按固定行高做窗口裁剪。
 */
const visible = computed(() => {
  const start = Math.max(0, Math.floor(scrollTop.value / props.rowHeight) - props.overscan);
  const visibleCount = Math.ceil(viewportHeight.value / props.rowHeight) + props.overscan * 2;
  return {
    start,
    rows: props.rows.slice(start, start + visibleCount),
    offset: start * props.rowHeight,
    totalHeight: props.rows.length * props.rowHeight,
  };
});

function onScroll(event: Event): void {
  const target = event.currentTarget as HTMLElement;
  scrollTop.value = target.scrollTop;
  viewportHeight.value = target.clientHeight;
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"]);
const CODE_EXT = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "html", "css", "scss", "less", "py", "go", "rs", "java", "sh",
]);

function iconFor(row: FlatRow) {
  if (row.node.type === "directory") return row.expanded ? FolderOpen : Folder;
  const ext = extname(row.node.path);
  if (IMAGE_EXT.has(ext)) return ImageIcon;
  if (ext === "json") return FileJson;
  if (["md", "txt", "log", "markdown"].includes(ext)) return FileText;
  if (CODE_EXT.has(ext)) return FileCode;
  return FileIcon;
}
</script>

<template>
  <div class="fm-tree" role="tree" @scroll.passive="onScroll">
    <!-- 占位容器撑出总高度，滚动条长度才有意义 -->
    <div class="fm-canvas" :style="{ height: `${visible.totalHeight}px` }">
      <div class="fm-window" :style="{ transform: `translateY(${visible.offset}px)` }">
        <div
          v-for="row in visible.rows"
          :key="row.node.path"
          class="fm-row"
          role="treeitem"
          :aria-expanded="row.hasChildren ? row.expanded : undefined"
          :aria-selected="row.node.path === activePath"
          :class="{ 'is-active': row.node.path === activePath }"
          :style="{ height: `${rowHeight}px`, paddingLeft: `${row.depth * 12 + 6}px` }"
          @click="row.hasChildren ? emit('toggle', row.node.path) : emit('open', row.node.path)"
          @contextmenu.prevent="emit('contextmenu', { event: $event, node: row.node })"
        >
          <span class="fm-twisty">
            <ChevronRight
              v-if="row.hasChildren"
              :size="14"
              class="fm-chevron"
              :class="{ 'is-open': row.expanded }"
            />
          </span>

          <Loader2 v-if="row.loading" :size="14" class="fm-spin" />
          <component :is="iconFor(row)" v-else :size="14" class="fm-icon" />

          <span class="fm-name">{{ row.node.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fm-tree {
  height: 100%;
  overflow: auto;
  font-size: 13px;
  user-select: none;
}

.fm-canvas {
  position: relative;
  width: 100%;
}

.fm-window {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  will-change: transform;
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

.fm-row.is-active {
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
