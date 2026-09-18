<template>
  <Button
    class="menu-button justify-between shadow-none"
    variant="ghost"
    v-bind="$attrs"
  >
    <div class="flex items-center flex-1 gap-1">
      <slot />
    </div>
    <div class="flex gap-2">
      <slot name="action" />
    </div>
  </Button>
</template>
<script lang="ts" setup>
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
