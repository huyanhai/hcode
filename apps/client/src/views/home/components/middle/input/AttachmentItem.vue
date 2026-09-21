<template>
  <Attachment state="uploading" class="group/attachment hover:bg-accent">
    <AttachmentMedia class="group-hover/attachment:bg-card">
      <img
        v-if="attachment.previewUrl"
        :src="attachment.previewUrl"
        :alt="attachment.name"
        class="absolute inset-0 h-full w-full object-cover"
      />
      <File v-else />
    </AttachmentMedia>
    <AttachmentContent>
      <AttachmentTitle class="max-w-[100px]">
        {{ attachment.name }}
      </AttachmentTitle>
      <AttachmentDescription>Uploading · 64%</AttachmentDescription>
    </AttachmentContent>
    <div
      aria-label="Cancel upload"
      class="group-hover/attachment:opacity-100 opacity-0 absolute bg-gradient-to-r right-0 from-80% bg-accent/90 via-100% bg-accent h-full items-center flex pr-1 pl-4 rounded-br-xl rounded-tr-xl"
    >
      <Button
        variant="outline"
        size="icon-sm"
        class="rounded-full w-6 h-6 shadow-none"
      >
        <X />
      </Button>
    </div>
  </Attachment>
</template>

<script lang="ts" setup>
import { File, X } from "@lucide/vue";

export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
}

defineProps<{
  attachment: AttachmentItem;
}>();
</script>
