<template>
  <article class="mt-3 border border-border bg-muted/30 p-3 text-sm">
    <div class="flex items-center gap-2 font-medium text-foreground">
      <ShieldAlert class="size-4 text-amber-600" aria-hidden="true" />
      <span>需要审批</span>
    </div>
    <p class="mt-2 text-muted-foreground">允许执行 {{ toolName }}</p>
    <pre
      class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background px-2 py-1.5 text-xs text-foreground"
      >{{ formatValue(input) }}</pre
    >
    <div class="mt-3 flex gap-2">
      <Button size="sm" :disabled="busy" @click="emit('respond', true)">
        允许
      </Button>
      <Button size="sm" variant="outline" :disabled="busy" @click="emit('respond', false)">
        拒绝
      </Button>
    </div>
  </article>
</template>

<script lang="ts" setup>
import { ShieldAlert } from "@lucide/vue";
import { Button } from "@/components/ui/button";

defineProps<{
  toolName: string;
  input: unknown;
  busy?: boolean;
}>();

const emit = defineEmits<{
  respond: [approved: boolean];
}>();

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
</script>
