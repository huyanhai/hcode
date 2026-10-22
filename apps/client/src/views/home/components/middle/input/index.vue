<template>
  <form class="w-full" @submit.prevent="handleSubmit">
    <InputGroup
      class="items-stretch overflow-hidden rounded-2xl gap-2 pt-2 shadow"
    >
      <div class="w-full flex flex-col gap-2 px-4">
        <div
          class="flex gap-2 items-end"
          v-if="visibleAttachments.length || modelData.comments.length"
        >
          <Attachment
            v-for="item in visibleAttachments"
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
          :disabled="disabled"
          :placeholder="sending ? '输入消息，回车排队' : undefined"
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
          :disabled="
            sending ? false : !canSubmit || disabled || hasPendingUpload
          "
          :aria-label="sending ? '停止生成' : '发送消息'"
          @click="sending ? emit('stop') : undefined"
        >
          <Square
            v-if="sending"
            class="fill-current"
            style="transform: scale(0.8)"
          />
          <!-- 附件上传中：图标切换为旋转 loading，与禁用状态呼应 -->
          <LoaderCircle v-else-if="hasPendingUpload" class="animate-spin" />
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
  LoaderCircle,
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
/** 在途上传任务：点发送时要等它们落地，避免附件被静默丢弃 */
const uploadTasks = new Map<string, Promise<unknown>>();

//#region Props
//#endregion
//#region Emits
const emit = defineEmits(["submit", "stop", "editComment", "removePin"]);
//#endregion
//#region Hooks
//#endregion
//#region Computed
const canSubmit = computed(() =>
  Boolean(
    modelData.value.attachments.length ||
      modelData.value.comments.length ||
      !!modelData.value.content.trim(),
  ),
);
/** 上传中：禁止发送避免附件被丢弃；上传失败不禁用（可降级发文字） */
const hasPendingUpload = computed(() =>
  modelData.value.attachments.some(
    (attachment) => attachment.uploadState === "uploading",
  ),
);
/** 被注释引用的截图附件不单独展示，改由注释条目左侧的缩略图呈现 */
const visibleAttachments = computed(() => {
  const linked = new Set(
    modelData.value.comments.flatMap((comment) =>
      comment.attachmentId ? [comment.attachmentId] : [],
    ),
  );
  return modelData.value.attachments.filter(
    // 上传后注释关联的是服务端附件 id，本地条目 id 和 uploaded.id 都要参与匹配
    (attachment) =>
      !linked.has(attachment.id) && !linked.has(attachment.uploaded?.id ?? ""),
  );
});
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

    return {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      file,
      uploadState: "uploading",
    };
  });

  modelData.value.attachments = [
    ...modelData.value.attachments,
    ...nextAttachments,
  ];
  for (const attachment of nextAttachments) {
    if (attachment.file.type.startsWith("image/")) {
      void createImagePreview(attachment.id, attachment.file);
    }
    const task = uploadSelectedAttachment(attachment.id, attachment.file);
    uploadTasks.set(attachment.id, task);
    void task.then(() => {
      if (uploadTasks.get(attachment.id) === task) {
        uploadTasks.delete(attachment.id);
      }
    });
  }
}

async function createImagePreview(id: string, file: File) {
  const previewUrl = await new Promise<string | undefined>((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : undefined);
    reader.onerror = () => resolve(undefined);
    reader.readAsDataURL(file);
  });
  if (!previewUrl) return;
  const attachment = modelData.value.attachments.find((item) => item.id === id);
  if (attachment) attachment.previewUrl = previewUrl;
}

async function uploadSelectedAttachment(id: string, file: File) {
  try {
    const uploaded = await uploadAttachment(file);
    const attachment = modelData.value.attachments.find(
      (item) => item.id === id,
    );
    if (!attachment) return;
    attachment.uploaded = uploaded;
    attachment.uploadState = "uploaded";
  } catch (error) {
    const attachment = modelData.value.attachments.find(
      (item) => item.id === id,
    );
    if (!attachment) return;
    attachment.uploadState = "error";
    attachment.uploadError =
      error instanceof Error ? error.message : "附件上传失败";
  }
}

function removeAttachment(id: string) {
  // id 可能是本地条目 id，也可能是上传后的服务端附件 id（注释关联用的是后者）
  const attachment = modelData.value.attachments.find(
    (item) => item.id === id || item.uploaded?.id === id,
  );
  if (!attachment) return;
  uploadTasks.delete(attachment.id);
  if (attachment.previewUrl && objectUrls.has(attachment.previewUrl)) {
    URL.revokeObjectURL(attachment.previewUrl);
    objectUrls.delete(attachment.previewUrl);
  }
  modelData.value.attachments = modelData.value.attachments.filter(
    (item) => item !== attachment,
  );
}

function removeComment(id: string) {
  const comment = modelData.value.comments.find((item) => item.id === id);
  // 网页批注：通知宿主移除页面上的标记 pin
  if (comment?.pinIndex != null) emit("removePin", comment.pinIndex);
  // 注释与截图附件是一体的：删注释时连截图一起移除
  if (comment?.attachmentId) removeAttachment(comment.attachmentId);
  modelData.value.comments = modelData.value.comments.filter(
    (item) => item.id !== id,
  );
}

function clearComments() {
  for (const comment of modelData.value.comments) {
    if (comment.attachmentId) removeAttachment(comment.attachmentId);
  }
  modelData.value.comments = [];
}

function selectTool(tool: "image" | "research" | "web-search") {
  console.log(tool);
}

function handleSubmit() {
  if (props.disabled || !canSubmit.value || hasPendingUpload.value) return;
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
/** 等待所有在途附件上传落地（成功或失败都返回），供发送前调用 */
async function whenUploadsSettle() {
  while (uploadTasks.size) {
    await Promise.allSettled([...uploadTasks.values()]);
  }
}
defineExpose({ whenUploadsSettle });
//#endregion
</script>
