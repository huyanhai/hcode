<template>
  <div class="flex max-w-full flex-wrap justify-end py-1 pl-4">
    <HoverCard
      v-for="(attachment, index) in attachments"
      :key="attachment.id"
      side="top"
      align="end"
      :offset="10"
    >
      <a
        :href="attachment.url"
        :download="attachment.name"
        target="_blank"
        rel="noreferrer"
        class="group relative -ml-4 block h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-background transition-transform first:ml-0 hover:z-50 hover:-translate-y-1 focus-visible:z-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :style="{ zIndex: index }"
        :aria-label="attachment.name"
      >
        <img
          v-if="isImage(attachment.mimeType)"
          :src="attachment.url"
          :alt="attachment.name"
          class="h-full w-full object-cover"
          loading="lazy"
        />
        <span
          v-else
          class="flex h-full w-full items-center justify-center text-muted-foreground"
        >
          <FileText class="size-7" />
        </span>
      </a>

      <template #content>
        <div v-if="isImage(attachment.mimeType)" class="max-w-80 p-2">
          <img
            :src="attachment.url"
            :alt="attachment.name"
            class="max-h-72 max-w-80 rounded-md object-contain"
            loading="lazy"
          />
          <div class="mt-2 min-w-0">
            <p class="break-all text-sm font-medium">{{ attachment.name }}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ formatBytes(attachment.size) }}
            </p>
          </div>
        </div>
        <div v-else class="flex max-w-72 items-center gap-3 p-2">
          <div class="min-w-0">
            <p class="flex text-sm font-medium overflow-hidden">
              {{ truncateFileNameSafe(attachment.name) }}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ formatBytes(attachment.size) }}
            </p>
          </div>
        </div>
      </template>
    </HoverCard>
  </div>
</template>

<script lang="ts" setup>
import { FileText } from "@lucide/vue";
import HoverCard from "@/components/hover-card/index.vue";
import type { MessageAttachment } from "@/lib/model-profiles-api";
import { truncateFileNameSafe } from "@/utils/string";

defineProps<{
  attachments: MessageAttachment[];
}>();

function isImage(mimeType: string) {
  return mimeType.toLowerCase().startsWith("image/");
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size < 1024) return `${size || 0} B`;
  const units = ["KB", "MB", "GB"];
  let value = size;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
</script>
