<template>
  <div class="max-w-full text-sm text-muted-foreground">
    <Thinking v-if="status === 'thinking'">正在思考</Thinking>
    <div v-else>
      <div class="flex gap-2 items-center group/item">
        <span>{{ summary }}</span>
        <ChevronRight
          class="size-4 shrink-0 invisible group-hover/item:visible"
          aria-hidden="true"
        />
      </div>
      <Separator class="my-2" />
      <div v-if="hasDetails">
        <p
          v-if="reasoning"
          class="whitespace-pre-wrap leading-6 text-foreground/80"
        >
          <Markdown :content="reasoning" />
        </p>
        <div v-if="toolCalls.length" class="space-y-1">
          <div v-for="toolCall in toolCalls" :key="toolCall.id">
            <Tools class="group/tool">
              <template #icon>
                <component :is="TOOLS_NAME_ICON_MAPS[toolCall.toolName]" />
              </template>
              <div class="flex items-center gap-2">
                <p :class="pendingStyle(toolCall)">
                  {{ toolSummary(toolCall) }}
                </p>
                <ChevronRight
                  class="size-4 shrink-0 transition-transform invisible group-hover/tool:visible"
                />
              </div>
            </Tools>
            <div class="typeset typeset-docs">
              <pre class="max-h-50 overflow-auto text-left max-h-50 items-start overflow-x-auto whitespace-pre-wrap">
                {{
                  toolCall.toolName === "execCommand"
                    ? commandOutput(toolCall.output)
                    : formatValue(toolCall.output)
                }}
              </pre>
            </div>
            <!-- <div>
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
              <div v-else-if="inputFor(toolCall) !== undefined">
                <div class="mb-1 text-xs font-medium text-muted-foreground">
                  操作参数
                </div>
                <pre
                  class="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background px-2 py-1.5 text-xs text-foreground"
                  >{{ formatValue(inputFor(toolCall)) }}</pre>
              </div>
              <div v-if="toolCall.output !== undefined">
                <div class="mb-1 text-xs font-medium text-muted-foreground">
                  {{
                    toolCall.toolName === "execCommand"
                      ? "命令输出"
                      : "操作结果"
                  }}
                </div>
                
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
            </div> -->
          </div>
        </div>
      </div>
      <p
        v-else
        class="ml-2 mt-1 border-l pb-2 pl-4 pt-1 text-xs text-muted-foreground"
      >
        {{ status === "streaming" ? "正在接收响应" : "没有可展开的过程记录" }}
      </p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ChevronRight, SquareTerminal, File } from "@lucide/vue";
import {
  ToolsName,
  type ResponseStreamStatus,
  type ResponseToolCall,
} from "./types";
import Thinking from "./markers/Thinking.vue";
import { TOOLS_NAME_ICON_MAPS } from "./constants";

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

function pendingStyle(toolCall: ResponseToolCall) {
  return toolCall.status === "in-progress" ? "shimmer" : "";
}

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
  const input = inputFor(toolCall);
  return input && typeof input === "object" && "command" in input
    ? String((input as { command?: unknown }).command ?? "")
    : "";
}

function inputFor(toolCall: ResponseToolCall): unknown {
  if (toolCall.input !== undefined) return toolCall.input;
  try {
    return JSON.parse(toolCall.rawArguments ?? "{}");
  } catch {
    return undefined;
  }
}

function toolSummary(toolCall: ResponseToolCall): string {
  const input = inputFor(toolCall) as Record<string, unknown> | undefined;
  const path = typeof input?.path === "string" ? input.path : "";
  if (toolCall.toolName === ToolsName.EXEC_COMMAND)
    return `已运行 ${commandFor(toolCall) || "命令"}`;
  if (toolCall.toolName === ToolsName.LIST_FILE)
    return `列出 ${path || "工作区"} 的文件`;
  if (toolCall.toolName === ToolsName.READ_FILE)
    return `读取 ${path || "文件"}`;
  if (toolCall.toolName === ToolsName.SEARCH_FILES)
    return `搜索 ${typeof input?.query === "string" ? `“${input.query}”` : "文件"}`;
  if (toolCall.toolName === ToolsName.WRITE_FILE)
    return `写入 ${path || "文件"}`;
  if (toolCall.toolName === ToolsName.APPLY_PATCH)
    return `应用 ${path || "文件"} 的补丁`;
  if (toolCall.toolName === ToolsName.GIT_STATUS) return "查看 Git 状态";
  if (toolCall.toolName === ToolsName.GIT_DIFF) return "查看 Git 变更";
  if (toolCall.toolName === ToolsName.GIT_LOG) return "查看 Git 提交记录";
  return toolCall.toolName;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2).trimStart() ?? String(value);
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
