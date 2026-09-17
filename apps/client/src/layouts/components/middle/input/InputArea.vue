<template>
  <div class="relative w-full px-4 pb-2 pt-3">
    <span
      v-if="!model"
      class="pointer-events-none absolute left-4 top-3 text-sm leading-6 text-muted-foreground/70"
    >
      {{ placeholder }}
    </span>
    <div
      ref="editorRef"
      :contenteditable="!disabled"
      role="textbox"
      aria-multiline="true"
      aria-label="Message"
      :aria-disabled="disabled"
      :class="[
        'min-h-14 max-h-40 w-full overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 outline-none',
        disabled && 'cursor-not-allowed opacity-60',
      ]"
      @input="handleInput"
      @keydown="handleKeydown"
      @paste="handlePaste"
    />
  </div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  {
    modelValue: "",
    placeholder: "随心输入",
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  submit: [];
}>();

const editorRef = ref<HTMLDivElement>();
const model = ref(props.modelValue);

watch(
  () => props.modelValue,
  (value) => {
    if (value !== model.value) {
      model.value = value;
      syncEditor();
    }
  },
);

watch(model, (value) => {
  emit("update:modelValue", value);
  void nextTick(resize);
});

function syncEditor() {
  const editor = editorRef.value;
  if (!editor || editor.innerText === model.value) return;

  editor.textContent = model.value;
}

function handleInput() {
  if (disabled.value) return;

  model.value = (editorRef.value?.innerText ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n");
  resize();
}

function handlePaste(event: ClipboardEvent) {
  if (disabled.value) return;

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
  if (!props.disabled && model.value.trim()) emit("submit");
}

function focus() {
  editorRef.value?.focus();
}

function clear() {
  model.value = "";
  if (editorRef.value) editorRef.value.textContent = "";
  void nextTick(resize);
}

const disabled = ref(props.disabled);

watch(
  () => props.disabled,
  (value) => {
    disabled.value = value;
  },
);

onMounted(() => {
  syncEditor();
  void nextTick(resize);
});

defineExpose({ clear, focus });
</script>
