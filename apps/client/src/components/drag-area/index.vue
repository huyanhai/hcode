<template>
  <div class="drag-area" aria-hidden="true" />
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

<style scoped>
.drag-area {
  position: fixed;
  inset: 0 0 auto;
  z-index: 20;
  height: 2rem;
  user-select: none;
  -webkit-app-region: drag;
}
</style>
