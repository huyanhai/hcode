<template>
  <HoverCard :offset="10" side="top">
    <Button variant="outline" class="rounded-full shadow-none">
      <span class="sr-only">View comments</span>
      <MessageSquare class="size-3.5" />
      <span>{{ comments.length }} 条注释</span>
    </Button>
    <template #content>123</template>
  </HoverCard>
  <!-- <div v-if="comments.length">
    <div
      class="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      aria-label="View comments"
    >
      <span class="sr-only">View comments</span>
      <MessageSquare class="size-3.5" />
      <span>{{ comments.length }} 条注释</span>
      <button
        type="button"
        class="ml-0.5 inline-flex size-5 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Remove all comments"
        @click.stop="emit('clear')"
      >
        <X class="size-3.5" />
      </button>
    </div>

    <div
      class="pointer-events-none absolute bottom-full left-4 z-20 mb-1 w-[min(28rem,calc(100vw-2rem))] origin-bottom-left scale-95 rounded-2xl border bg-background p-2 opacity-0 shadow-lg transition-all duration-150 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:scale-100 group-focus-within:opacity-100"
      role="region"
      aria-label="Comments"
    >
      <article
        v-for="(comment, index) in comments"
        :key="comment.id"
        class="flex gap-3 rounded-xl p-3 transition-colors hover:bg-muted/50"
      >
        <span class="mt-0.5 text-sm text-muted-foreground"
          >{{ index + 1 }}.</span
        >
        <div class="min-w-0 flex-1">
          <p
            v-if="comment.selectedText"
            class="mb-1 truncate text-xs text-muted-foreground"
          >
            所选文本：{{ comment.selectedText }}
          </p>
          <p class="whitespace-pre-wrap break-words text-sm">
            {{ comment.content }}
          </p>
        </div>
        <div class="flex shrink-0 items-start gap-1 text-muted-foreground">
          <button
            type="button"
            class="rounded-md p-1.5 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="`Edit comment ${index + 1}`"
            @click="emit('edit', comment.id)"
          >
            <Pencil class="size-4" />
          </button>
          <button
            type="button"
            class="rounded-md p-1.5 hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="`Delete comment ${index + 1}`"
            @click="emit('remove', comment.id)"
          >
            <Trash2 class="size-4" />
          </button>
        </div>
      </article>
    </div>
  </div> -->
</template>

<script lang="ts" setup>
import { MessageSquare, Pencil, Trash2, X } from "@lucide/vue";
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
