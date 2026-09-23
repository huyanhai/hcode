<template>
  <article class="mt-3 border border-border bg-muted/30 p-3 text-sm">
    <div class="flex items-center gap-2 font-medium text-foreground">
      <ShieldAlert class="size-4 text-amber-600" aria-hidden="true" />
      <span>需要审批</span>
    </div>
    <p class="mt-2 text-muted-foreground">是否允许执行命令?</p>
    <div
      class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background px-2 py-1.5 text-xs text-foreground"
    >
      {{ input.command }}
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
</script>
