<template>
  <div class="typeset typeset-docs" v-html="renderedMarkdown" />
</template>
<script lang="ts" setup>
import { marked, Renderer } from "marked";

//#region Props
const props = defineProps<{
  content: string;
}>();
//#endregion
//#region Emits
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
</script>
