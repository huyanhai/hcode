<template>
  <Marker role="status">
    <MarkerContent
      :class="[
        'shimmer',
        singleLine ? 'truncate whitespace-nowrap overflow-hidden' : '',
      ]"
    >
      <slot />
    </MarkerContent>
  </Marker>
</template>
<script lang="ts" setup>
defineProps<{ singleLine?: boolean }>();
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
