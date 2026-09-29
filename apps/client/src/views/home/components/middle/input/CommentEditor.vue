<template>
  <div
    class="box-border w-full min-w-0 rounded-full border bg-background p-2 shadow-lg flex items-center"
  >
    <input
      ref="textareaRef"
      v-model="content"
      class="text-sm bg-none flex-1 h-6 outline-0 ml-2"
      placeholder="输入评论..."
      @keydown.enter.exact.prevent="confirm"
    />
    <Button size="icon-sm" class="rounded-full" @click="confirm">
      <Check />
    </Button>
    <div class="flex justify-end gap-2">
      <!-- <Button variant="ghost" size="sm" @click="emit('cancel')">取消</Button> -->
    </div>
  </div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, ref } from "vue";
import { Check } from "@lucide/vue";

const props = defineProps<{
  selectedText: string;
  initialContent?: string;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [content: string];
}>();

const content = ref(props.initialContent ?? "");
const textareaRef = ref<InstanceType<typeof HTMLInputElement>>();

function confirm() {
  emit("confirm", content.value.trim());
}

onMounted(() => nextTick(() => textareaRef.value?.$el?.focus()));
</script>
