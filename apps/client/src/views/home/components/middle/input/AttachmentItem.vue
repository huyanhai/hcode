<template>
  <Attachment
    :state="
      attachment.uploadState === 'error'
        ? 'error'
        : attachment.uploadState === 'uploaded'
          ? 'done'
          : 'uploading'
    "
    class="group/attachment hover:bg-accent"
  >
    <AttachmentMedia class="group-hover/attachment:bg-card">
      <img
        v-if="attachment.previewUrl && !previewFailed"
        :src="attachment.previewUrl"
        :alt="attachment.name"
        class="absolute inset-0 h-full w-full object-cover"
        @error="handlePreviewError"
      />
      <File v-else />
    </AttachmentMedia>
    <AttachmentContent>
      <AttachmentTitle class="max-w-[100px]">
        {{ attachment.name }}
      </AttachmentTitle>
      <AttachmentDescription>
        {{
          attachment.uploadState === "uploading"
            ? "上传中..."
            : attachment.uploadState === "error"
              ? "上传失败"
              : "已上传"
        }}
      </AttachmentDescription>
    </AttachmentContent>
    <div
      aria-label="Cancel upload"
      class="group-hover/attachment:opacity-100 opacity-0 absolute bg-gradient-to-r right-0 from-80% bg-accent/90 via-100% bg-accent h-full items-center flex pr-1 pl-4 rounded-br-xl rounded-tr-xl"
    >
      <Button
        variant="outline"
        size="icon-sm"
        class="rounded-full w-6 h-6 shadow-none"
        @click="emit('remove', attachment.id)"
      >
        <X />
      </Button>
    </div>
  </Attachment>
</template>

<script lang="ts" setup>
import { File, X } from "@lucide/vue";
import { ref, watch } from "vue";

export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
  uploadState: "uploading" | "uploaded" | "error";
  uploaded?: {
    id: string;
    url: string;
    name: string;
    mimeType: string;
    size: number;
  };
  uploadError?: string;
  previewUrl?: string;
}

const props = defineProps<{
  attachment: AttachmentItem;
}>();
const emit = defineEmits<{ remove: [id: string] }>();
const previewFailed = ref(false);

watch(
  () => props.attachment.previewUrl,
  () => {
    previewFailed.value = false;
  },
);

function handlePreviewError() {
  previewFailed.value = true;
}
</script>
