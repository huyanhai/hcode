<template>
  <div class="flex flex-col gap-1">
    <ActionsButton @click="open = !open">
      <Folder v-if="open" />
      <FolderOpen v-else />
      {{ title }}
      <template #action>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button class="button-hover" type="button" @click.stop>
              <Ellipsis :size="ICON_SIZE" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @select="archiveWorkspace">
              <Archive :size="ICON_SIZE" />
              归档
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" @select="deleteWorkspace">
              <Trash2 :size="ICON_SIZE" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button @click.stop="editWorkspace" class="button-hover" type="button">
          <SquarePen :size="ICON_SIZE" />
        </button>
      </template>
    </ActionsButton>
    <div v-show="open" class="flex flex-col gap-1">
      <slot />
    </div>
  </div>
</template>
<script lang="ts" setup>
import {
  Archive,
  Ellipsis,
  Folder,
  FolderOpen,
  SquarePen,
  Trash2,
} from "@lucide/vue";
import { ICON_SIZE } from "@/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const open = ref(true);
const emit = defineEmits<{
  "edit-workspace": [];
  "archive-workspace": [];
  "delete-workspace": [];
}>();

function editWorkspace() {
  emit("edit-workspace");
}

function archiveWorkspace() {
  emit("archive-workspace");
}

function deleteWorkspace() {
  emit("delete-workspace");
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
