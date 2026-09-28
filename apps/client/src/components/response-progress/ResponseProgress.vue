<template>
  <div class="max-w-full text-muted-foreground group/agent">
    <div class="text-sm">
      <Thinking v-if="status === 'thinking'">正在思考</Thinking>
      <template v-else>
        <button
          type="button"
          class="flex w-full items-center gap-2 text-left cursor-pointer"
          :aria-expanded="showDetails"
          @click="showDetails = !showDetails"
        >
          <span>{{ summary }}</span>
          <ChevronRight
            :class="
              cn(
                'size-4 shrink-0 transition-transform group-hover/agent:visible invisible',
                showDetails ? 'rotate-90' : '',
              )
            "
            aria-hidden="true"
          />
        </button>
        <Separator class="my-2" />
      </template>
    </div>
    <template v-if="showDetails">
      <slot />
    </template>
  </div>
</template>

<script lang="ts" setup>
import { ChevronRight } from "@lucide/vue";
import { type ResponseStreamStatus } from "./types";
import Thinking from "./markers/Thinking.vue";
import { cn } from "@/lib/utils";

const showDetails = ref(true);

const props = withDefaults(
  defineProps<{
    status: ResponseStreamStatus;
    startedAt?: string;
    completedAt?: string;
  }>(),
  {
    startedAt: undefined,
    completedAt: undefined,
  },
);

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

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
    showDetails.value = !["completed", "failed", "stopped"].includes(status);
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
</script>
