<template>
  <div class="flex items-center w-full">
    <Button
      :class="cn('menu-button justify-between shadow-none flex-1', $attrs.class)"
      variant="ghost"
      v-bind="$attrs"
    >
      <div class="flex items-center flex-1 gap-1">
        <slot />
      </div>
    </Button>
    <div class="flex items-center gap-2 pr-2">
      <slot name="action" />
    </div>
  </div>
</template>
<script lang="ts" setup>
import { cn } from "@/lib/utils";

//#region Props
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
