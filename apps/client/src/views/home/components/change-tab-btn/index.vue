<template>
  <Button
    variant="ghost"
    class="button button-hover no-drag"
    @click="open = !open"
  >
    <template v-if="direction === 'right'">
      <PanelRight v-if="open" />
      <PanelRightOpen v-else />
    </template>
    <template v-else>
      <PanelLeft v-if="open" />
      <PanelLeftOpen v-else />
    </template>
  </Button>
</template>
<script lang="ts" setup>
import {
  PanelRight,
  PanelRightOpen,
  PanelLeft,
  PanelLeftOpen,
} from "@lucide/vue";

const open = defineModel<boolean>();
//#region Props
defineProps<{ direction?: "left" | "right" }>();
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
