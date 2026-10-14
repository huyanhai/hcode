<template>
  <HoverCard :offset="14" side="top" :align="align">
    <CloseableButton
      variant="outline"
      class="shadow-none px-2 rounded-xl"
      :show-close="!readonly"
    >
      <MessageSquare />
      <span>{{ comments.length }} 条注释</span>
    </CloseableButton>
    <template #content>
      <article
        v-for="(comment, index) in comments"
        :key="comment.id"
        class="flex gap-3 rounded-xl p-2 transition-colors hover:bg-muted/50 items-start"
      >
        <div v-if="comment.imageUrl" class="relative shrink-0">
          <img
            :src="comment.imageUrl"
            alt=""
            class="size-14 rounded-lg border object-cover"
            :class="
              comment.imageState === 'error'
                ? 'border-destructive ring-1 ring-destructive'
                : ''
            "
          />
          <span
            v-if="comment.imageState === 'uploading'"
            class="absolute inset-0 grid place-items-center rounded-lg bg-background/60"
          >
            <LoaderCircle class="size-4 animate-spin text-muted-foreground" />
          </span>
          <span
            v-else-if="comment.imageState === 'error'"
            class="absolute inset-0 grid place-items-center rounded-lg bg-destructive/10"
          >
            <TriangleAlert class="size-4 text-destructive" />
          </span>
        </div>
        <span class="mt-0.5 text-sm text-muted-foreground">
          {{ index + 1 }}.
        </span>
        <div class="min-w-0 flex-1">
          <p
            v-if="comment.selectedText"
            class="mb-1 truncate text-sm text-muted-foreground"
          >
            所选文本：{{ comment.selectedText }}
          </p>
          <p class="whitespace-pre-wrap break-words text-sm">
            {{ comment.content }}
          </p>
        </div>
        <div class="flex shrink-0 items-start gap-1" v-if="!readonly">
          <Button
            @click="emit('edit', comment.id)"
            size="icon-sm"
            variant="ghost"
          >
            <Pencil />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            @click="emit('remove', comment.id)"
          >
            <Trash2 />
          </Button>
        </div>
      </article>
    </template>
  </HoverCard>
</template>

<script lang="ts" setup>
import {
  LoaderCircle,
  MessageSquare,
  Pencil,
  Trash2,
  TriangleAlert,
} from "@lucide/vue";
import CloseableButton from "@/components/closeable-button/indev.vue";
import HoverCard from "@/components/hover-card/index.vue";
export interface InputComment {
  id: string;
  content: string;
  selectedText?: string;
  messageId?: string;
  startOffset?: number;
  endOffset?: number;
  /** 批注截图（data URL），有图时显示在注释条目左侧 */
  imageUrl?: string;
  /** 截图对应的附件 id；移除注释时一并移除该附件 */
  attachmentId?: string;
  /** 网页批注在页面内的标记序号；编辑/删除时用于定位页面上的 pin */
  pinIndex?: number;
  /** 截图上传状态，用于在缩略图上提示 */
  imageState?: "uploading" | "uploaded" | "error";
}

const { align = "start" } = defineProps<{
  comments: InputComment[];
  readonly?: boolean;
  align?: "start" | "center" | "end";
}>();

const emit = defineEmits<{
  clear: [];
  edit: [id: string];
  remove: [id: string];
}>();
</script>
