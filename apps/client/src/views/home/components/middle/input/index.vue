<template>
  <form class="w-full" @submit.prevent="handleSubmit">
    <InputGroup class="items-stretch overflow-hidden rounded-2xl gap-2 pt-2 shadow">
      <div class="w-full flex flex-col gap-2 px-4">
        <div
          class="flex gap-2 items-end"
          v-if="modelData.attachments.length || modelData.comments.length"
        >
          <Attachment
            v-for="item in modelData.attachments"
            :key="item.id"
            :attachment="item"
            @remove="removeAttachment"
          />
          <Comment
            v-if="modelData.comments.length"
            :comments="modelData.comments"
            @clear="clearComments"
            @edit="emit('editComment', $event)"
            @remove="removeComment"
          />
        </div>
        <InputArea
          ref="inputAreaRef"
          v-model="modelData.content"
          @submit="handleSubmit"
          @paste-image="handlePastedImage"
        />
      </div>

      <InputGroupAddon align="block-end" class="gap-0 px-2! pb-2!">
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
              type="button"
              size="icon-sm"
              variant="ghost"
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
          type="button"
          class="ml-1 button-full px-2 text-orange-600 hover:text-orange-600"
          variant="ghost"
          size="sm"
          @click="modelData.fullAccess = !modelData.fullAccess"
        >
          <ShieldCheck />
          <span>{{ modelData.fullAccess ? "完全访问" : "受限访问" }}</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              class="ml-auto button-full px-2"
            >
              <span>{{ selectedModel || "未配置模型" }}</span>
              <!-- <span class="text-muted-foreground">高</span> -->
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
        >
          <Mic />
        </InputGroupButton>
        <InputGroupButton
          :type="sending ? 'button' : 'submit'"
          variant="default"
          size="icon-sm"
          class="ml-1 button-full shrink-0"
          :disabled="sending ? false : !canSubmit || disabled || hasPendingUpload || hasUploadError"
          :aria-label="sending ? '停止生成' : '发送消息'"
          @click="sending ? emit('stop') : undefined"
        >
          <Square v-if="sending" class="fill-current" />
          <ArrowUp v-else />
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
  Square,
  Telescope,
} from "@lucide/vue";
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { uploadAttachment } from "@/lib/model-profiles-api";
import Attachment, { type AttachmentItem } from "./AttachmentItem.vue";
import Comment, { type InputComment } from "./Comment.vue";
import InputArea from "./InputArea.vue";

export interface SubmitPayload {
  content: string;
  attachments: AttachmentItem[];
  comments: InputComment[];
  model: string;
  fullAccess: boolean;
}

const props = defineProps<{
  models?: string[];
  disabled?: boolean;
  sending?: boolean;
}>();

const modelData = defineModel<SubmitPayload>({ required: true });

const fileInputRef = ref<HTMLInputElement>();
const inputAreaRef = ref<InstanceType<typeof InputArea>>();
const menuOpen = ref(false);
const selectedModel = computed({
  get: () => modelData.value.model,
  set: (value: string) => {
    modelData.value.model = value;
  },
});
const modelOptions = computed(() => props.models ?? []);
const objectUrls = new Set<string>();

//#region Props
//#endregion
//#region Emits
const emit = defineEmits(["submit", "stop", "editComment"]);
//#endregion
//#region Hooks
//#endregion
//#region Computed
const canSubmit = computed(() =>
  Boolean(
    modelData.value.attachments.length || !!modelData.value.content.trim(),
  ),
);
const hasPendingUpload = computed(() =>
  modelData.value.attachments.some((attachment) => attachment.uploadState === "uploading"),
);
const hasUploadError = computed(() =>
  modelData.value.attachments.some((attachment) => attachment.uploadState === "error"),
);
//#endregion
//#region Watch
//#endregion
//#region Event
//#endregion
//#region Function
function openFilePicker() {
  menuOpen.value = false;
  fileInputRef.value?.click();
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files ? Array.from(input.files) : [];
  if (!files.length) return;
  addFiles(files);
  input.value = "";
}

function handlePastedImage(file: File) {
  if (file.name) {
    addFiles([file]);
    return;
  }
  addFiles([
    new File([file], `pasted-image-${Date.now()}.png`, {
      type: file.type || "image/png",
      lastModified: file.lastModified,
    }),
  ]);
}

function addFiles(files: File[]) {
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
      file,
      uploadState: "uploading",
      previewUrl,
    };
  });

  modelData.value.attachments = [
    ...modelData.value.attachments,
    ...nextAttachments,
  ];
  for (const attachment of nextAttachments) {
    void uploadSelectedAttachment(attachment.id, attachment.file);
  }
}

async function uploadSelectedAttachment(id: string, file: File) {
  try {
    const uploaded = await uploadAttachment(file);
    const attachment = modelData.value.attachments.find((item) => item.id === id);
    if (!attachment) return;
    if (attachment.previewUrl && objectUrls.has(attachment.previewUrl)) {
      URL.revokeObjectURL(attachment.previewUrl);
      objectUrls.delete(attachment.previewUrl);
    }
    if (file.type.startsWith("image/")) attachment.previewUrl = uploaded.url;
    attachment.uploaded = uploaded;
    attachment.uploadState = "uploaded";
  } catch (error) {
    const attachment = modelData.value.attachments.find((item) => item.id === id);
    if (!attachment) return;
    attachment.uploadState = "error";
    attachment.uploadError = error instanceof Error ? error.message : "附件上传失败";
  }
}

function removeAttachment(id: string) {
  const attachment = modelData.value.attachments.find((item) => item.id === id);
  if (attachment?.previewUrl && objectUrls.has(attachment.previewUrl)) {
    URL.revokeObjectURL(attachment.previewUrl);
    objectUrls.delete(attachment.previewUrl);
  }
  modelData.value.attachments = modelData.value.attachments.filter(
    (item) => item.id !== id,
  );
}

function removeComment(id: string) {
  modelData.value.comments = modelData.value.comments.filter(
    (comment) => comment.id !== id,
  );
}

function clearComments() {
  modelData.value.comments = [];
}

function selectTool(tool: "image" | "research" | "web-search") {
  console.log(tool);
}

function handleSubmit() {
  if (!canSubmit.value || hasPendingUpload.value || hasUploadError.value) return;
  emit("submit");

  nextTick(() => {
    modelData.value.content = "";
    modelData.value.attachments.forEach((attachment) => {
      if (attachment.previewUrl && objectUrls.has(attachment.previewUrl)) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
    objectUrls.clear();
    modelData.value.attachments = [];
    modelData.value.comments = [];
    inputAreaRef.value?.clear();
  });
}
//#endregion
//#region Life Cycle
onBeforeUnmount(() => {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
});
//#endregion
//#region Expose
//#endregion
</script>
