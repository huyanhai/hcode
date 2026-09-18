<template>
  <HoverCard :offset="14" side="top" align="start">
    <CloseableButton
      variant="outline"
      class="shadow-none px-2 rounded-xl"
      show-close
    >
      <MessageSquare />
      <span>{{ comments.length }} 条注释</span>
    </CloseableButton>
    <template #content>
      <article
        v-for="(comment, index) in comments"
        :key="comment.id"
        class="flex gap-3 rounded-xl p-2 transition-colors hover:bg-muted/50"
      >
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
        <div class="flex shrink-0 items-start gap-1">
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
import { MessageSquare, Pencil, Trash2 } from "@lucide/vue";
import CloseableButton from "@/components/closeable-button/indev.vue";
import HoverCard from "@/components/hover-card/index.vue";
export interface InputComment {
  id: string;
  content: string;
  selectedText?: string;
}

defineProps<{
  comments: InputComment[];
}>();

const emit = defineEmits<{
  clear: [];
  edit: [id: string];
  remove: [id: string];
}>();
</script>
