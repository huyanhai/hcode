<template>
  <Button v-bind="$attrs" :class="cn($attrs.class, 'relative group/closeable')">
    <slot />
    <div
      v-if="showClose"
      @click="$emit('remove')"
      class="group-hover/closeable:opacity-100 opacity-0 absolute bg-gradient-to-r right-1 from-0% bg-accent/50 via-10% bg-accent h-full items-center flex right-0 rounded-br-full rounded-tr-full pl-4"
    >
      <Button
        variant="outline"
        size="icon-sm"
        class="rounded-full w-6 h-6 shadow-none"
      >
        <X />
      </Button>
    </div>
  </Button>
</template>
<script lang="ts" setup>
import { cn } from "@/lib/utils";
import { X } from "@lucide/vue";
//#region Props
const { showClose } = defineProps<{ showClose?: boolean }>();
//#endregion
//#region Emits
//#endregion
//#region Hooks
//#endregion
//#region Computed
//#endregion
//#region Watch
//#endregion
//#region Event
//#endregion
//#region Function
//#endregion
//#region Life Cycle
//#endregion
//#region Expose
//#endregion
</script>
