<template>
  <div class="rounded-xl border overflow-hidden">
    <div ref="diffRef" class="max-h-40 overflow-auto"></div>
  </div>
</template>
<script lang="ts" setup>
import { EditorView, basicSetup } from "codemirror";
import { unifiedMergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";

const diffRef = useTemplateRef("diffRef");
const diffInstance = ref<InstanceType<typeof EditorView> | null>(null);
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
onMounted(() => {
  if (diffRef.value) {
    diffInstance.value = new EditorView({
      parent: diffRef.value,
      doc: "one\ntwo\nthree\nfour", // 当前文档
      extensions: [
        EditorState.readOnly.of(true),
        basicSetup,
        unifiedMergeView({
          original: "one\n...\nfour", // 对比的原始文档
          gutter: true, // 显示变更标记
          mergeControls: false,
          allowInlineDiffs: false, // 默认 false，仅行内变更
        }),
      ],
    });
  }
});

onUnmounted(() => {
  // diffInstance.value?.destroy();
});
//#endregion
//#region Expose
//#endregion
</script>
