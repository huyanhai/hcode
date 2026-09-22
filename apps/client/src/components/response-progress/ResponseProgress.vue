<template>
  <div class="max-w-full text-sm text-muted-foreground">
    <div
      v-if="status === 'thinking'"
      class="flex h-8 items-center gap-2"
      role="status"
    >
      <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
      <span>正在思考</span>
    </div>
    <details v-else class="group/details">
      <summary
        class="flex h-8 cursor-pointer list-none items-center gap-2 rounded-md px-1 text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden"
      >
        <ChevronRight
          class="size-4 shrink-0 transition-transform group-open/details:rotate-90"
          aria-hidden="true"
        />
        <Clock3 class="size-4 shrink-0" aria-hidden="true" />
        <span>{{ summary }}</span>
      </summary>
      <div
        v-if="hasDetails"
        class="ml-2 mt-1 space-y-3 border-l pl-4 pb-2 pt-1"
      >
        <p v-if="reasoning" class="whitespace-pre-wrap leading-6 text-foreground/80">
          {{ reasoning }}
        </p>
        <ol v-if="toolCalls.length" class="space-y-2">
          <li
            v-for="toolCall in toolCalls"
            :key="toolCall.id"
            class="flex items-center gap-2"
          >
            <Wrench class="size-3.5 shrink-0" aria-hidden="true" />
            <span>{{ toolCall.toolName }}</span>
            <span class="text-xs text-muted-foreground">{{ toolStatusLabel(toolCall.status) }}</span>
          </li>
        </ol>
      </div>
      <p v-else class="ml-2 mt-1 border-l pb-2 pl-4 pt-1 text-xs text-muted-foreground">
        {{ status === "streaming" ? "正在接收响应" : "没有可展开的过程记录" }}
      </p>
    </details>
  </div>
</template>

<script lang="ts" setup>
import { ChevronRight, Clock3, LoaderCircle, Wrench } from "@lucide/vue";
import type { ResponseStreamStatus, ResponseToolCall } from "./types";

const props = withDefaults(
  defineProps<{
    status: ResponseStreamStatus;
    startedAt?: string;
    completedAt?: string;
    reasoning?: string;
    toolCalls?: ResponseToolCall[];
  }>(),
  { startedAt: undefined, completedAt: undefined, reasoning: "", toolCalls: () => [] },
);

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

const hasDetails = computed(
  () => Boolean(props.reasoning?.trim()) || props.toolCalls.length > 0,
);
const summary = computed(() => {
  const elapsed = formatElapsed(elapsedMilliseconds());
  if (props.status === "completed") return `用时 ${elapsed} · 已完成`;
  if (props.status === "failed") return `用时 ${elapsed} · 已失败`;
  if (props.status === "stopped") return `用时 ${elapsed} · 已停止`;
  return `用时 ${elapsed}`;
});

watch(
  () => props.status,
  (status) => {
    if (status === "streaming" && !timer) {
      now.value = Date.now();
      timer = setInterval(() => {
        now.value = Date.now();
      }, 1_000);
    }
    if (status !== "streaming" && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

function elapsedMilliseconds(): number {
  const startedAt = Number(props.startedAt ?? 0);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return 0;
  const endedAt = props.completedAt ? Number(props.completedAt) : now.value;
  return Math.max(0, endedAt - startedAt);
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes} 分 ${remainder} 秒` : `${remainder} 秒`;
}

function toolStatusLabel(status: ResponseToolCall["status"]): string {
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  return "执行中";
}
</script>
