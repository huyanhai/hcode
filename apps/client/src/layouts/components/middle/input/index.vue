<template>
  <form class="w-full" @submit.prevent="handleSubmit">
    <InputGroup
      class="items-stretch overflow-hidden rounded-2xl"
    >
      <div class="w-full">
        <Attachment :attachments="attachments" @remove="removeAttachment" />
        <Comment
          :comments="comments"
          @clear="clearComments"
          @edit="emit('edit-comment', $event)"
          @remove="removeComment"
        />
        <InputArea
          ref="inputAreaRef"
          v-model="draft"
          :disabled="disabled || isBusy"
          :placeholder="placeholder"
          @submit="handleSubmit"
        />
      </div>

      <InputGroupAddon align="block-end" class="px-3 pt-1">
        <input
          ref="fileInputRef"
          type="file"
          multiple
          class="hidden"
          @change="handleFileChange"
        />

        <DropdownMenu v-model:open="menuOpen">
          <DropdownMenuTrigger as-child>
            <InputGroupButton
              aria-label="Add files or tools"
              type="button"
              size="icon-sm"
              variant="ghost"
              :disabled="disabled || isBusy"
              class="button-full"
            >
              <Plus />
            </InputGroupButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" class="w-48">
            <DropdownMenuItem @click="openFilePicker">
              <Paperclip />
              添加附件
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="selectTool('image')">
              <ImageIcon />
              创建图片
            </DropdownMenuItem>
            <DropdownMenuItem @click="selectTool('research')">
              <Telescope />
              深度研究
            </DropdownMenuItem>
            <DropdownMenuItem @click="selectTool('web-search')">
              <Globe />
              网页搜索
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          class="ml-1 button-full px-2 text-orange-600 hover:text-orange-600"
          variant="ghost"
          size="sm"
          @click="fullAccess = !fullAccess"
        >
          <ShieldCheck />
          <span>{{ fullAccess ? "完全访问" : "受限访问" }}</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              size="sm"
              variant="ghost"
              class="ml-auto button-full px-2"
            >
              <span>{{ selectedModel }}</span>
              <span class="text-muted-foreground">高</span>
              <ChevronDown class="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" class="w-44">
            <DropdownMenuItem
              v-for="modelOption in modelOptions"
              :key="modelOption"
              @click="selectedModel = modelOption"
            >
              {{ modelOption }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <InputGroupButton
          type="button"
          size="icon-sm"
          variant="ghost"
          class="ml-1 button-full"
          :disabled="disabled || isBusy"
          @click="emit('voice-input')"
        >
          <Mic />
        </InputGroupButton>
        <InputGroupButton
          type="submit"
          variant="default"
          size="icon-sm"
          class="ml-1 button-full bg-blue-600 text-white hover:bg-blue-700"
          :disabled="!canSubmit || disabled || isBusy"
        >
          <ArrowUp />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  </form>
</template>

<script lang="ts" setup>
import {
  ArrowUp,
  ChevronDown,
  Globe,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Plus,
  ShieldCheck,
  Telescope,
} from "@lucide/vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Attachment, { type AttachmentItem } from "./Attachment.vue";
import Comment, { type InputComment } from "./Comment.vue";
import InputArea from "./InputArea.vue";

interface SubmitPayload {
  content: string;
  attachments: AttachmentItem[];
  comments: InputComment[];
  model: string;
  fullAccess: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    attachments?: AttachmentItem[];
    comments?: InputComment[];
    placeholder?: string;
    disabled?: boolean;
    isBusy?: boolean;
  }>(),
  {
    modelValue: "",
    attachments: () => [],
    comments: () => [],
    placeholder: "随心输入",
    disabled: false,
    isBusy: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:attachments": [value: AttachmentItem[]];
  "update:comments": [value: InputComment[]];
  submit: [payload: SubmitPayload];
  "remove-comment": [id: string];
  "edit-comment": [id: string];
  "tool-select": [tool: "image" | "research" | "web-search"];
  "voice-input": [];
}>();

const draft = ref(props.modelValue);
const attachments = ref<AttachmentItem[]>([...props.attachments]);
const comments = ref<InputComment[]>([...props.comments]);
const fileInputRef = ref<HTMLInputElement>();
const inputAreaRef = ref<InstanceType<typeof InputArea>>();
const menuOpen = ref(false);
const fullAccess = ref(true);
const selectedModel = ref("5.6 Luna");
const modelOptions = ["5.6 Luna", "5.6 Terra", "5.5"];
const objectUrls = new Set<string>();

watch(draft, (value) => emit("update:modelValue", value));

watch(
  () => props.modelValue,
  (value) => {
    if (value !== draft.value) draft.value = value;
  },
);

watch(
  () => props.attachments,
  (value) => {
    attachments.value = [...value];
  },
);

watch(
  () => props.comments,
  (value) => {
    comments.value = [...value];
  },
);

const canSubmit = computed(() =>
  Boolean(draft.value.trim() || attachments.value.length),
);

function openFilePicker() {
  menuOpen.value = false;
  fileInputRef.value?.click();
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files ? Array.from(input.files) : [];
  if (!files.length) return;

  const nextAttachments = files.map((file, index): AttachmentItem => {
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${index}`;
    const previewUrl = file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : undefined;
    if (previewUrl) objectUrls.add(previewUrl);

    return {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      previewUrl,
    };
  });

  attachments.value = [...attachments.value, ...nextAttachments];
  emit("update:attachments", attachments.value);
  input.value = "";
}

function removeAttachment(id: string) {
  const attachment = attachments.value.find((item) => item.id === id);
  if (attachment?.previewUrl && objectUrls.has(attachment.previewUrl)) {
    URL.revokeObjectURL(attachment.previewUrl);
    objectUrls.delete(attachment.previewUrl);
  }
  attachments.value = attachments.value.filter((item) => item.id !== id);
  emit("update:attachments", attachments.value);
}

function removeComment(id: string) {
  comments.value = comments.value.filter((comment) => comment.id !== id);
  emit("update:comments", comments.value);
  emit("remove-comment", id);
}

function clearComments() {
  const removedIds = comments.value.map((comment) => comment.id);
  comments.value = [];
  emit("update:comments", []);
  removedIds.forEach((id) => emit("remove-comment", id));
}

function selectTool(tool: "image" | "research" | "web-search") {
  emit("tool-select", tool);
}

function handleSubmit() {
  if (!canSubmit.value || props.disabled || props.isBusy) return;

  emit("submit", {
    content: draft.value.trim(),
    attachments: [...attachments.value],
    comments: [...comments.value],
    model: selectedModel.value,
    fullAccess: fullAccess.value,
  });

  draft.value = "";
  attachments.value.forEach((attachment) => {
    if (attachment.previewUrl && objectUrls.has(attachment.previewUrl)) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  });
  objectUrls.clear();
  attachments.value = [];
  emit("update:attachments", []);
  comments.value = [];
  emit("update:comments", []);
  inputAreaRef.value?.clear();
}

onBeforeUnmount(() => {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
});
</script>
