<template>
  <div class="pt-14 px-2 flex flex-col gap-4">
    <Button class="menu-button" variant="ghost">
      <SquarePen animateOnHover triggerTarget="parent" />
      新会话
    </Button>

    <div>
      <div class="text-sm text-muted-foreground flex gap-1 items-center mb-2 px-2">最近
        <ChevronDown :size="16" />
      </div>
      <div class="flex flex-col gap-1">
        <Button class="menu-button" variant="ghost">12</Button>
        <Button class="menu-button" variant="ghost">12</Button>
        <Button class="menu-button" variant="ghost">12</Button>
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { SquarePen } from '@respeak/lucide-motion-vue'
import { ChevronDown } from "@lucide/vue"
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
