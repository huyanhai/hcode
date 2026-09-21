<template>
  <div>
    <ActionsButton @click="open = !open">
      <Folder v-if="open" />
      <FolderOpen v-else />
      {{ title }}
      <template #action>
        <button
          type="button"
          class="button-hover rounded-md p-1"
          aria-label="项目操作"
          @click.stop
        >
          <Ellipsis :size="10" />
        </button>
        <button
          type="button"
          class="button-hover rounded-md p-1"
          aria-label="创建会话"
          @click.stop="createSession"
        >
          <SquarePen :size="10" />
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
