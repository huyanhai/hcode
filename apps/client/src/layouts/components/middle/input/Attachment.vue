<template>
  <div
    v-if="attachments.length"
    class="flex w-full gap-2 overflow-x-auto px-4 pt-3"
    aria-label="Attachments"
  >
    <article
      v-for="attachment in attachments"
      :key="attachment.id"
      class="group relative flex h-24 w-28 shrink-0 flex-col justify-between overflow-hidden rounded-xl border bg-muted/30 p-2"
    >
      <img
        v-if="attachment.previewUrl"
        :src="attachment.previewUrl"
        :alt="attachment.name"
        class="absolute inset-0 h-full w-full object-cover"
      >
      <div
        v-else
        class="flex size-9 items-center justify-center rounded-lg bg-background text-muted-foreground"
      >
        <FileText class="size-5" />
      </div>
      <div
        class="relative mt-auto truncate rounded-md bg-background/85 px-1.5 py-1 text-xs text-foreground backdrop-blur-sm"
        :title="attachment.name"
      >
        {{ attachment.name }}
      </div>
      <button
        type="button"
        :aria-label="`Remove ${attachment.name}`"
        class="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
        @click="emit('remove', attachment.id)"
      >
        <X class="size-3.5" />
      </button>
    </article>
  </div>
</template>

<script lang="ts" setup>
import { FileText, X } from "@lucide/vue";

export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
}

defineProps<{
  attachments: AttachmentItem[];
}>();

const emit = defineEmits<{
  remove: [id: string];
}>();
</script>
