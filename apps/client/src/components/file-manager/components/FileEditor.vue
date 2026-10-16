<template>
  <div class="fm-editor">
    <div v-if="file.error" class="fm-error">{{ file.error }}</div>
    <div v-else-if="file.loading" class="fm-loading">加载中…</div>
    <div ref="host" class="fm-host" />
  </div>
</template>
<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  nextTick,
  ref,
  shallowRef,
  watch,
} from "vue";
import { basicSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { resolveLanguage } from "../utils/language";
import type { OpenFile } from "../store";

const props = defineProps<{ file: OpenFile }>();
const emit = defineEmits<{
  (event: "change", content: string): void;
  (event: "save"): void;
}>();

const host = ref<HTMLDivElement | null>(null);
const view = shallowRef<EditorView | null>(null);
/** 语言包替换用：切换文件时只重配 compartment，不重建整个编辑器。 */
const languageCompartment = new Compartment();

/** 记录进入编辑时的文档版本，用于区分「本地改动」与「外部同步的更新」。 */
let applyingExternal = false;

async function createView(
  container: HTMLElement,
  path: string,
): Promise<void> {
  const language = await resolveLanguage(path);

  // 语言包加载是异步的，等待期间磁盘读取可能已完成（content 已更新）。
  // 这里必须取最新值建文档，否则会出现「文件有内容但编辑器显示为空」，
  // 且用户在空文档上继续输入并保存会覆盖磁盘内容。
  const content = props.file.content;

  const state = EditorState.create({
    doc: content,
    extensions: [
      basicSetup,
      languageCompartment.of(language),
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            emit("save");
            return true;
          },
        },
      ]),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || applyingExternal) return;
        emit("change", update.state.doc.toString());
      }),
      // 主题跟随宿主的 CSS 变量，避免硬编码配色
      EditorView.theme({
        "&": {
          height: "100%",
          backgroundColor: "var(--fm-editor-bg, #ffffff)",
          color: "var(--fm-editor-fg, #1f2937)",
          fontSize: "13px",
        },
        ".cm-scroller": {
          fontFamily:
            "var(--fm-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
          lineHeight: "1.6",
        },
        ".cm-content": { caretColor: "var(--fm-editor-fg, #1f2937)" },
        ".cm-gutters": {
          backgroundColor: "var(--fm-editor-bg, #ffffff)",
          color: "var(--fm-fg-muted, #9ca3af)",
          border: "none",
        },
        "&.cm-focused": { outline: "none" },
      }),
    ],
  });

  view.value = new EditorView({ state, parent: container });
}

/**
 * 创建视图的统一入口。
 * 宿主用 :key="file.path" 复用本组件（每个文件一个实例），因此视图必须在
 * onMounted 里创建 —— 仅靠 path 的 watch 的话，挂载后 path 不再变化，永远不触发。
 * 文件尚在加载时先建视图，文档内容在 createView 内取 props.file.content 的
 * 最新值；加载完成后内容由下方 content 的 watch 回填。
 */
onMounted(() => {
  if (host.value) void createView(host.value, props.file.path);
});

watch(
  () => props.file.path,
  async (path) => {
    // 兜底：若宿主不以 path 为 key，切换文件时销毁旧实例、重建新文档
    view.value?.destroy();
    view.value = null;
    await nextTick();
    if (host.value) void createView(host.value, path);
  },
);

watch(
  () => props.file.content,
  (content) => {
    const current = view.value;
    if (!current) return;
    // 外部同步写回 store 时不要回弹光标
    if (current.state.doc.toString() === content) return;
    applyingExternal = true;
    current.dispatch({
      changes: { from: 0, to: current.state.doc.length, insert: content },
    });
    applyingExternal = false;
  },
);

onBeforeUnmount(() => {
  view.value?.destroy();
  view.value = null;
});
</script>

<style scoped>
.fm-editor {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.fm-host {
  height: 100%;
}

.fm-loading,
.fm-error {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 13px;
  color: var(--fm-fg-muted, #6b7280);
  background: var(--fm-editor-bg, #ffffff);
  z-index: 1;
}

.fm-error {
  color: var(--fm-danger, #dc2626);
}
</style>
