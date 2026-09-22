<template>
  <div class="max-w-full text-sm text-muted-foreground">
    <Thinking v-if="status === 'thinking'">正在思考</Thinking>
    <div v-else class="group/details">
      <div>{{ summary }}</div>
      <Separator class="my-4" />
      <!-- <Tools>summary{{  }}</Tools> -->
      <!-- <summary
        class="flex h-8 cursor-pointer list-none items-center gap-2 rounded-md px-1 text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden"
      >
        <ChevronRight
          class="size-4 shrink-0 transition-transform group-open/details:rotate-90"
          aria-hidden="true"
        />
        <SquareTerminal
          v-if="commandToolCalls.length"
          class="size-4 shrink-0"
          aria-hidden="true"
        />
        <span>{{ commandToolCalls.length ? "运行了命令" : summary }}</span>
      </summary> -->
      <div v-if="hasDetails" class="ml-2 mt-1 space-y-3 pb-2 pt-1">
        <p
          v-if="reasoning"
          class="whitespace-pre-wrap leading-6 text-foreground/80"
        >
          {{ reasoning }}
        </p>
        <ol v-if="commandToolCalls.length" class="space-y-1">
          <li
            v-for="toolCall in commandToolCalls"
            :key="toolCall.id"
            class="rounded-md"
          >
            <details class="group/command">
              <summary
                class="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 text-foreground/90 outline-none hover:bg-accent/50 [&::-webkit-details-marker]:hidden"
                :title="commandFor(toolCall)"
              >
                <ChevronRight
                  class="size-3.5 shrink-0 transition-transform group-open/command:rotate-90"
                  aria-hidden="true"
                />
                <SquareTerminal class="size-3.5 shrink-0" aria-hidden="true" />
                <span class="shimmer">
                  已运行 {{ commandFor(toolCall) || "命令" }}
                </span>
                <span class="ml-auto shrink-0 text-xs text-muted-foreground">{{
                  toolStatusLabel(toolCall.status)
                }}</span>
              </summary>
              <div class="ml-7 space-y-2 border-border/60 pb-2 pt-1">
                <pre
                  v-if="toolCall.output !== undefined"
                  class="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background px-2 py-1.5 text-xs text-foreground"
                >
                  {{ commandOutput(toolCall.output) }}
                </pre>
              </div>
            </details>
          </li>
        </ol>
        <ol v-if="otherToolCalls.length" class="space-y-2">
          <li
            v-for="toolCall in otherToolCalls"
            :key="toolCall.id"
            class="rounded-md border border-border/60 bg-muted/20"
          >
            <details class="group/tool">
              <summary
                class="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-foreground/90 outline-none hover:bg-accent/50 [&::-webkit-details-marker]:hidden"
              >
                <ChevronRight
                  class="size-3.5 shrink-0 transition-transform group-open/tool:rotate-90"
                  aria-hidden="true"
                />
                <Wrench class="size-3.5 shrink-0" aria-hidden="true" />
                <span class="font-medium">{{ toolCall.toolName }}</span>
                <span class="text-xs text-muted-foreground">{{
                  toolStatusLabel(toolCall.status)
                }}</span>
              </summary>
              <div class="space-y-2 border-t border-border/60 px-2 pb-2 pt-2">
                <div
                  v-if="
                    toolCall.toolName === 'execCommand' && commandFor(toolCall)
                  "
                >
                  <div class="mb-1 text-xs font-medium text-muted-foreground">
                    执行命令
                  </div>
                  <pre
                    class="overflow-auto whitespace-pre-wrap rounded bg-background px-2 py-1.5 text-xs text-foreground"
                    >{{ commandFor(toolCall) }}</pre>
                </div>
                <div v-else-if="toolCall.input !== undefined">
                  <div class="mb-1 text-xs font-medium text-muted-foreground">
                    参数
                  </div>
                  <pre
                    class="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background px-2 py-1.5 text-xs text-foreground"
                    >{{ formatValue(toolCall.input) }}</pre>
                </div>
                <div v-if="toolCall.output !== undefined">
                  <div class="mb-1 text-xs font-medium text-muted-foreground">
                    输出结果
                  </div>
                  <pre
                    class="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background px-2 py-1.5 text-xs text-foreground"
                    >{{ formatValue(toolCall.output) }}</pre>
                </div>
                <div
                  v-if="
                    toolCall.output === undefined &&
                    toolCall.status === 'in-progress'
                  "
                  class="text-xs text-muted-foreground"
                >
                  正在等待工具结果…
                </div>
              </div>
            </details>
          </li>
        </ol>
      </div>
      <p v-else class="shimmer">
        {{ status === "streaming" ? "正在接收响应" : "没有可展开的过程记录" }}
      </p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ChevronRight, SquareTerminal, Wrench } from "@lucide/vue";
import type { ResponseStreamStatus, ResponseToolCall } from "./types";
import Thinking from "./markers/Thinking.vue";
import Tools from "./markers/Tools.vue";

const props = withDefaults(
  defineProps<{
    status: ResponseStreamStatus;
    startedAt?: string;
    completedAt?: string;
    reasoning?: string;
    toolCalls?: ResponseToolCall[];
  }>(),
  {
    startedAt: undefined,
    completedAt: undefined,
    reasoning: "",
    toolCalls: () => [],
  },
);

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

const hasDetails = computed(
  () => Boolean(props.reasoning?.trim()) || props.toolCalls.length > 0,
);
const commandToolCalls = computed(() =>
  props.toolCalls.filter((toolCall) => toolCall.toolName === "execCommand"),
);
const otherToolCalls = computed(() =>
  props.toolCalls.filter((toolCall) => toolCall.toolName !== "execCommand"),
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

function commandFor(toolCall: ResponseToolCall): string {
  if (
    toolCall.input &&
    typeof toolCall.input === "object" &&
    "command" in toolCall.input
  ) {
    return String((toolCall.input as { command?: unknown }).command ?? "");
  }
  try {
    const parsed = JSON.parse(toolCall.rawArguments ?? "{}");
    return parsed && typeof parsed === "object"
      ? String(parsed.command ?? "")
      : "";
  } catch {
    return "";
  }
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function commandOutput(value: unknown): string {
  if (!value || typeof value !== "object") return formatValue(value);
  const output = value as {
    stdout?: unknown;
    stderr?: unknown;
    exitCode?: unknown;
    timedOut?: unknown;
  };
  const sections: string[] = [];
  if (output.stdout) sections.push(String(output.stdout));
  if (output.stderr) sections.push(`[stderr]\n${String(output.stderr)}`);
  if (output.timedOut) sections.push("[命令超时]");
  if (output.exitCode !== undefined && output.exitCode !== null)
    sections.push(`[退出码: ${String(output.exitCode)}]`);
  return sections.length ? sections.join("\n") : formatValue(value);
}
</script>
