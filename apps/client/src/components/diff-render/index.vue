<template>
  <div class="rounded-xl border overflow-hidden">
    <div class="h-8 bg-accent flex items-center px-2">{{ fileName }}</div>
    <div ref="diffRef" class="max-h-40 overflow-auto"></div>
  </div>
</template>
<script lang="ts" setup>
import { EditorView, basicSetup } from "codemirror";
import { unifiedMergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";

const diffRef = useTemplateRef("diffRef");
const diffInstance = ref<InstanceType<typeof EditorView> | null>(null);
const props = defineProps<{
  fileName: string;
  originalContent: string;
  content: string;
}>();
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
function renderDiff() {
  diffInstance.value?.destroy();
  if (!diffRef.value) return;
  diffInstance.value = new EditorView({
    parent: diffRef.value,
    doc: props.content,
    extensions: [
      EditorState.readOnly.of(true),
      basicSetup,
      unifiedMergeView({
        original: props.originalContent,
        gutter: true,
        mergeControls: false,
        allowInlineDiffs: false,
      }),
    ],
  });
}

watch(() => [props.originalContent, props.content] as const, renderDiff);
onMounted(renderDiff);
onUnmounted(() => diffInstance.value?.destroy());
//#region Expose
//#endregion
</script>
