<template>
  <div>
    <ActionsButton @click="open = !open">
      <Folder v-if="open" />
      <FolderOpen v-else />
      {{ title }}
      <template #action>
        <button class="button-hover">
          <Ellipsis :size="ICON_SIZE" />
        </button>
        <button @click.stop="createSession" class="button-hover">
          <SquarePen :size="ICON_SIZE" />
        </button>
      </template>
    </ActionsButton>
    <div v-show="open">
      <slot />
    </div>
  </div>
</template>
<script lang="ts" setup>
import { SquarePen, Ellipsis, Folder, FolderOpen } from "@lucide/vue";
import { ICON_SIZE } from "@/constants";

const open = ref(true);
const emit = defineEmits<{ "create-session": [] }>();

function createSession() {
  open.value = true;
  emit("create-session");
}
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
