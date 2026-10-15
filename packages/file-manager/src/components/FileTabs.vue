<script setup lang="ts">
import { X } from "lucide-vue-next";
import type { OpenFile } from "../store";

defineProps<{
  files: OpenFile[];
  activePath: string;
}>();

const emit = defineEmits<{
  (event: "select", path: string): void;
  (event: "close", path: string): void;
}>();

function isDirty(file: OpenFile): boolean {
  return file.content !== file.savedContent;
}
</script>

<template>
  <div v-if="files.length" class="fm-tabs" role="tablist">
    <div
      v-for="file in files"
      :key="file.path"
      class="fm-tab"
      role="tab"
      :aria-selected="file.path === activePath"
      :class="{ 'is-active': file.path === activePath }"
      @click="emit('select', file.path)"
    >
      <span class="fm-tab-name">{{ file.name }}</span>
      <span v-if="file.conflicted" class="fm-dot is-conflict" title="外部已修改，存在冲突" />
      <span v-else-if="isDirty(file)" class="fm-dot" title="未保存" />
      <button class="fm-close" type="button" title="关闭" @click.stop="emit('close', file.path)">
        <X :size="12" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.fm-tabs {
  display: flex;
  align-items: stretch;
  gap: 1px;
  overflow-x: auto;
  background: var(--fm-tabs-bg, #f3f4f6);
  border-bottom: 1px solid var(--fm-border, #e5e7eb);
}

.fm-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px 12px;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  color: var(--fm-fg-muted, #6b7280);
  border-right: 1px solid var(--fm-border, #e5e7eb);
}

.fm-tab.is-active {
  background: var(--fm-editor-bg, #ffffff);
  color: var(--fm-fg, #111827);
}

.fm-tab-name {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fm-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fm-fg-muted, #9ca3af);
  flex: 0 0 6px;
}

.fm-dot.is-conflict {
  background: var(--fm-danger, #dc2626);
}

.fm-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.fm-close:hover {
  background: var(--fm-hover, rgba(0, 0, 0, 0.08));
}
</style>
