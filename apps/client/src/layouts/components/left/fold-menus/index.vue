<template>
  <div>
    <ActionsButton @click="open = !open">
      <Folder v-if="open" />
      <FolderOpen v-else />
      12
      <template #action>
        <Ellipsis :size="10" />
        <SquarePen :size="10" />
      </template>
    </ActionsButton>
    <ActionsButton @click="open = !open">
      123
      <template #action>
        <Archive :size="10" />
      </template>
    </ActionsButton>
  </div>
</template>
<script lang="ts" setup>
import { SquarePen, Ellipsis, Folder, FolderOpen, Archive } from "@lucide/vue";
const open = ref(false);
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
