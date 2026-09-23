<template>
  <details :open="false" v-if="hasDetails">
    <summary class="flex cursor-pointer list-none items-center">
      <slot name="title" />
    </summary>
    <div class="mt-2">
      <slot />
    </div>
  </details>
  <slot name="title" v-else />
</template>
<script lang="ts" setup>
//#region Props
defineProps<{ hasDetails?: boolean }>();
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
