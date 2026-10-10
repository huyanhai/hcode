<template>
  <template v-for="item in items" :key="item.id">
    <Markdown
      v-if="item.type === 'text'"
      class="text-base"
      :content="item.content"
    />
    <Tools v-else :has-details="hasFileDetails(item.toolCall)">
      <template #title>
        <Tool class="group/tool my-2!">
          <template #icon>
            <component :is="TOOLS_NAME_ICON_MAPS[item.toolCall.toolName]" />
          </template>
          <div class="flex items-center gap-2 truncate">
            <p :class="pendingStyle(item.toolCall)">
              {{ toolSummary(item.toolCall) }}
            </p>
            <ChevronRight
              v-if="hasFileDetails(item.toolCall)"
              :class="
                cn(
                  'size-4 shrink-0 transition-transform invisible group-hover/tool:visible',
                )
              "
            />
          </div>
        </Tool>
      </template>
      <div v-if="hasFileDetails(item.toolCall)" class="typeset typeset-docs">
        <pre class="max-h-50 overflow-auto whitespace-pre-wrap font-mono">{{
          commandOutput(item.toolCall.output).trim()
        }}</pre>
      </div>
    </Tools>
  </template>
</template>

<script lang="ts" setup>
import { ChevronRight } from "@lucide/vue";
import Markdown from "@/components/markdown/index.vue";
import Tools from "@/components/response-progress/Tools.vue";
import Tool from "@/components/response-progress/markers/Tool.vue";
import {
  type ResponseTimelineItem,
  type ResponseToolCall,
} from "@/components/response-progress";
import { ToolsName } from "@/components/response-progress/types";
import { TOOLS_NAME_ICON_MAPS } from "@/components/response-progress/constants";
import { cn } from "@/lib/utils";

withDefaults(
  defineProps<{
    items?: ResponseTimelineItem[];
  }>(),
  {
    items: () => [],
  },
);

function pendingStyle(toolCall: ResponseToolCall) {
  return toolCall.status === "in-progress" ? "shimmer" : "";
}

function hasFileDetails(toolCall: ResponseToolCall) {
  return [ToolsName.BASH, ToolsName.WRITE, ToolsName.EDIT].includes(
    toolCall.toolName as ToolsName,
  );
}

function inputFor(toolCall: ResponseToolCall): unknown {
  if (toolCall.input !== undefined) return toolCall.input;
  try {
    return JSON.parse(toolCall.rawArguments ?? "{}");
  } catch {
    return undefined;
  }
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
  if (toolCall.toolName === ToolsName.BASH)
    return `已运行 ${commandFor(toolCall) || "命令"}`;
  if (toolCall.toolName === ToolsName.READ) return `读取 ${path || "文件"}`;
  if (toolCall.toolName === ToolsName.WRITE) return `写入 ${path || "文件"}`;
  if (toolCall.toolName === ToolsName.EDIT) return `编辑 ${path || "文件"}`;
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
  if (output.stderr) sections.push(String(output.stderr));
  if (output.timedOut) sections.push("[命令超时]");
  if (output.exitCode !== undefined && output.exitCode !== null)
    sections.push(`[退出码: ${String(output.exitCode)}]`);
  return sections.length ? sections.join("\n") : formatValue(value);
}
</script>
