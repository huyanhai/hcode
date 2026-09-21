<template>
  <div class="relative w-full">
    <span
      v-if="!prompt.trim()"
      class="pointer-events-none absolute left-0 top-0 text-sm leading-6 text-muted-foreground/70"
    >
      {{ placeholder || "随心输入" }}
    </span>
    <div
      ref="editorRef"
      :contenteditable="!disabled"
      :class="[
        'min-h-20 max-h-40 w-full overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 outline-none',
        disabled && 'cursor-not-allowed opacity-60',
      ]"
      @input="handleInput"
      @keydown="handleKeydown"
      @paste="handlePaste"
    />
  </div>
</template>
<script lang="ts" setup>
const editorRef = ref<HTMLDivElement>();

const prompt = defineModel({ required: true, type: String });
//#region Props
const { disabled, placeholder } = defineProps<{
  placeholder?: string;
  disabled?: boolean;
}>();
//#endregion
//#region Emits
const emit = defineEmits(["submit"]);
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
// 同步数据
function syncEditor() {
  const editor = editorRef.value;
  if (!editor || editor.innerText === prompt.value) return;
  editor.textContent = prompt.value;
}

function handleInput() {
  if (disabled) return;

  prompt.value = (editorRef.value?.innerText ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n");
  resize();
}

function handlePaste(event: ClipboardEvent) {
  if (disabled) return;

  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") ?? "";
  document.execCommand("insertText", false, text);
}

function resize() {
  const editor = editorRef.value;
  if (!editor) return;

  editor.style.height = "auto";
  editor.style.height = `${Math.min(editor.scrollHeight, 160)}px`;
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!disabled && prompt.value.trim()) emit("submit");
}

function focus() {
  editorRef.value?.focus();
}

function clear() {
  prompt.value = "";
  if (editorRef.value) editorRef.value.textContent = "";
  nextTick(resize);
}
//#endregion
//#region Life Cycle
onMounted(() => {
  syncEditor();
  nextTick(resize);
});
//#endregion
//#region Expose
defineExpose({ clear, focus });
//#endregion
</script>
