<template>
  <article class="mt-3 border rounded-xl border-border bg-muted/30 p-3 text-sm">
    <div class="flex items-center gap-2 font-medium text-foreground">
      <ShieldAlert class="size-4 text-amber-600" aria-hidden="true" />
      <span>需要审批</span>
    </div>
    <p class="mt-2 text-muted-foreground">
      是否允许{{ operaName }}{{ input.path }}?
    </p>
    <div
      v-if="isCommand"
      class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background px-2 py-1.5 text-xs text-foreground"
    >
      {{ commandText }}
    </div>
    <div class="mt-3 flex gap-2">
      <Button size="sm" :disabled="busy" @click="emit('respond', true)">
        允许
      </Button>
      <Button
        size="sm"
        variant="outline"
        :disabled="busy"
        @click="emit('respond', false)"
      >
        拒绝
      </Button>
    </div>
  </article>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { ShieldAlert } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { TOOLS_NAME_MAPS } from "../response-progress/constants";
import { ToolsName } from "../response-progress/types";

const props = defineProps<{
  toolName: string;
  input: unknown;
  busy?: boolean;
}>();

const commandText = computed(() => {
  const input = props.input;
  if (!input || typeof input !== "object") return "";
  if (!("command" in input)) return "";

  const command = input.command;
  if (typeof command === "string") return command;
  if (command === undefined) return "";

  return JSON.stringify(command, null, 2);
});

const isCommand = computed(() => {
  return props.toolName === ToolsName.EXEC_COMMAND;
});

const operaName = computed(() => {
  return TOOLS_NAME_MAPS[props.toolName];
});

const emit = defineEmits<{
  respond: [approved: boolean];
}>();
</script>
