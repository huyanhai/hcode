<template>
  <div class="space-y-3">
    <template v-for="item in items" :key="item.id">
      <Markdown v-if="item.type === 'text'" :content="item.content" />
      <details v-else class="group/tool rounded-md border border-border/70 bg-muted/20">
        <summary class="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm text-foreground outline-none hover:bg-accent/50 [&::-webkit-details-marker]:hidden">
          <ChevronRight class="size-3.5 shrink-0 transition-transform group-open/tool:rotate-90" aria-hidden="true" />
          <SquareTerminal v-if="item.toolCall.toolName === 'execCommand'" class="size-3.5 shrink-0" aria-hidden="true" />
          <Wrench v-else class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ toolSummary(item.toolCall) }}</span>
          <span class="ml-auto shrink-0 text-xs text-muted-foreground">{{ toolStatus(item.toolCall.status) }}</span>
        </summary>
        <div class="space-y-2 border-t border-border/70 px-3 pb-3 pt-2">
          <div v-if="commandFor(item.toolCall)">
            <div class="mb-1 text-xs font-medium text-muted-foreground">执行命令</div>
            <pre class="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background px-2 py-1.5 text-xs text-foreground">{{ commandFor(item.toolCall) }}</pre>
          </div>
          <div v-else-if="inputFor(item.toolCall) !== undefined">
            <div class="mb-1 text-xs font-medium text-muted-foreground">操作参数</div>
            <pre class="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background px-2 py-1.5 text-xs text-foreground">{{ formatValue(inputFor(item.toolCall)) }}</pre>
          </div>
          <div v-if="item.toolCall.output !== undefined">
            <div class="mb-1 text-xs font-medium text-muted-foreground">{{ item.toolCall.toolName === 'execCommand' ? '命令输出' : '操作结果' }}</div>
            <pre class="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background px-2 py-1.5 text-xs text-foreground">{{ item.toolCall.toolName === 'execCommand' ? commandOutput(item.toolCall.output) : formatValue(item.toolCall.output) }}</pre>
          </div>
          <p v-else-if="item.toolCall.status === 'in-progress'" class="text-xs text-muted-foreground">正在等待工具结果…</p>
        </div>
      </details>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { ChevronRight, SquareTerminal, Wrench } from "@lucide/vue";
import Markdown from "@/components/markdown/index.vue";
import type { ResponseToolCall } from "@/components/response-progress";

type TimelineItem =
  | { id: string; type: "text"; content: string }
  | { id: string; type: "tool"; toolCall: ResponseToolCall };

const props = withDefaults(defineProps<{ content: string; toolCalls?: ResponseToolCall[] }>(), {
  toolCalls: () => [],
});

const items = computed<TimelineItem[]>(() => {
  const calls = props.toolCalls
    .map((toolCall, index) => ({
      toolCall,
      index,
      offset: Math.max(0, Math.min(props.content.length, toolCall.contentOffset ?? props.content.length)),
    }))
    .sort((left, right) => left.offset - right.offset || left.index - right.index);
  const timeline: TimelineItem[] = [];
  let cursor = 0;
  for (const { toolCall, offset } of calls) {
    if (offset > cursor) {
      timeline.push({ id: `text:${cursor}`, type: "text", content: props.content.slice(cursor, offset) });
      cursor = offset;
    }
    timeline.push({ id: `tool:${toolCall.id}`, type: "tool", toolCall });
  }
  if (cursor < props.content.length) timeline.push({ id: `text:${cursor}`, type: "text", content: props.content.slice(cursor) });
  return timeline;
});

function inputFor(toolCall: ResponseToolCall): unknown {
  if (toolCall.input !== undefined) return toolCall.input;
  try { return JSON.parse(toolCall.rawArguments ?? "{}"); } catch { return undefined; }
}

function commandFor(toolCall: ResponseToolCall): string {
  const input = inputFor(toolCall);
  return input && typeof input === "object" && "command" in input
    ? String((input as { command?: unknown }).command ?? "")
    : "";
}

function toolSummary(toolCall: ResponseToolCall): string {
  const input = inputFor(toolCall) as Record<string, unknown> | undefined;
  const path = typeof input?.path === "string" ? input.path : "";
  if (toolCall.toolName === "execCommand") return `运行 ${commandFor(toolCall) || "命令"}`;
  if (toolCall.toolName === "listFiles") return `列出 ${path || "工作区"} 的文件`;
  if (toolCall.toolName === "readFile") return `读取 ${path || "文件"}`;
  if (toolCall.toolName === "searchFiles") return `搜索 ${typeof input?.query === "string" ? `“${input.query}”` : "文件"}`;
  if (toolCall.toolName === "writeFile") return `写入 ${path || "文件"}`;
  if (toolCall.toolName === "applyPatch") return `应用 ${path || "文件"} 的补丁`;
  if (toolCall.toolName === "gitStatus") return "查看 Git 状态";
  if (toolCall.toolName === "gitDiff") return "查看 Git 变更";
  if (toolCall.toolName === "gitLog") return "查看 Git 提交记录";
  return toolCall.toolName;
}

function toolStatus(status: ResponseToolCall["status"]): string {
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  return "执行中";
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2) ?? String(value); } catch { return String(value); }
}

function commandOutput(value: unknown): string {
  if (!value || typeof value !== "object") return formatValue(value);
  const output = value as { stdout?: unknown; stderr?: unknown; exitCode?: unknown; timedOut?: unknown };
  const sections: string[] = [];
  if (output.stdout) sections.push(String(output.stdout));
  if (output.stderr) sections.push(`[stderr]\n${String(output.stderr)}`);
  if (output.timedOut) sections.push("[命令超时]");
  if (output.exitCode !== undefined && output.exitCode !== null) sections.push(`[退出码: ${String(output.exitCode)}]`);
  return sections.length ? sections.join("\n") : formatValue(value);
}
</script>
