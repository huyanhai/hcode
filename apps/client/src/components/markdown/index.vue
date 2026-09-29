<template>
  <div
    ref="rootRef"
    data-slot="markdown"
    class="typeset typeset-docs"
    v-html="renderedMarkdown"
    @click="handleClick"
  />
</template>
<script lang="ts" setup>
import { marked, Renderer } from "marked";

export type MarkdownAnnotation = {
  id: string;
  selectedText?: string;
  startOffset?: number;
  endOffset?: number;
};

//#region Props
const props = defineProps<{
  content: string;
  annotations?: MarkdownAnnotation[];
}>();
//#endregion
//#region Emits
const emit = defineEmits<{
  annotationClick: [id: string, event: MouseEvent];
}>();
//#endregion
//#region Hooks
//#endregion
//#region Computed
const renderedMarkdown = computed(() => {
  const renderer = new Renderer();
  renderer.html = ({ raw }) => escapeHtml(raw);

  return marked.parse(props.content, {
    async: false,
    breaks: true,
    gfm: true,
    renderer,
  });
});
//#endregion
//#region Watch
const rootRef = ref<HTMLElement>();

watch(
  [renderedMarkdown, () => props.annotations],
  () => nextTick(decorateAnnotations),
  { deep: true, flush: "post" },
);
onMounted(() => nextTick(decorateAnnotations));
//#endregion
//#region Event
//#endregion
//#region Function
//#endregion
//#region Life Cycle
//#endregion
//#region Expose
//#endregion

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function decorateAnnotations() {
  const root = rootRef.value;
  if (!root) return;
  clearAnnotationMarkers(root);
  if (!props.annotations?.length) return;

  for (const annotation of props.annotations) {
    const range = annotationRange(root, annotation);
    if (!range) continue;
    const nodes = textNodesInRange(root, range.start, range.end);
    for (const { node, start } of nodes) {
      const from = Math.max(0, range.start - start);
      const to = Math.min(node.data.length, range.end - start);
      if (from >= to) continue;
      const after = to < node.data.length ? node.splitText(to) : undefined;
      const selected = from > 0 ? node.splitText(from) : node;
      const marker = document.createElement("mark");
      marker.dataset.commentId = annotation.id;
      marker.className = "comment-marker cursor-pointer rounded-sm bg-sky-200/70 px-0.5 text-inherit transition-colors hover:bg-sky-300/80";
      selected.replaceWith(marker);
      marker.append(selected);
      void after;
    }
  }
}

function clearAnnotationMarkers(root: HTMLElement) {
  let marker = root.querySelector<HTMLElement>("mark[data-comment-id]");
  while (marker) {
    const parent = marker.parentNode;
    if (!parent) return;
    while (marker.firstChild) parent.insertBefore(marker.firstChild, marker);
    parent.removeChild(marker);
    marker = root.querySelector<HTMLElement>("mark[data-comment-id]");
  }
}

function annotationRange(root: HTMLElement, annotation: MarkdownAnnotation) {
  const text = root.textContent ?? "";
  const start =
    Number.isInteger(annotation.startOffset) && annotation.startOffset! >= 0
      ? annotation.startOffset!
      : annotation.selectedText
        ? text.indexOf(annotation.selectedText)
        : -1;
  const end =
    Number.isInteger(annotation.endOffset) && annotation.endOffset! > start
      ? annotation.endOffset!
      : start + (annotation.selectedText?.length ?? 0);
  if (start < 0 || end <= start || end > text.length) return;
  return { start, end };
}

function textNodesInRange(root: HTMLElement, rangeStart: number, rangeEnd: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; start: number }> = [];
  let cursor = 0;
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const end = cursor + textNode.data.length;
    if (end > rangeStart && cursor < rangeEnd) {
      nodes.push({ node: textNode, start: cursor });
    }
    cursor = end;
    node = walker.nextNode();
  }
  return nodes;
}

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement;
  const marker = target.closest<HTMLElement>("[data-comment-id]");
  if (marker?.dataset.commentId) {
    emit("annotationClick", marker.dataset.commentId, event);
  }
}
</script>
