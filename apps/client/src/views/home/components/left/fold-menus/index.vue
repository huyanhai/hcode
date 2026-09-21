<template>
  <div>
    <ActionsButton @click="open = !open">
      <Folder v-if="open" />
      <FolderOpen v-else />
      {{ title }}
      <template #action>
        <Ellipsis :size="10" />
        <SquarePen :size="10" />
      </template>
    </ActionsButton>
    <div v-show="open">
      <slot />
    </div>
  </div>
</template>
<script lang="ts" setup>
import { SquarePen, Ellipsis, Folder, FolderOpen } from "@lucide/vue";
const open = ref(false);
//#region Props
defineProps<{ title: string }>();
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
