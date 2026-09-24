<template>
  <div
    class="flex justify-between items-center"
    style="-webkit-app-region: drag"
  >
    <div class="flex gap-2 pl-20">
      <Button variant="ghost" @click="left = !left" class="button button-hover">
        <PanelLeft v-if="left" />
        <PanelLeftOpen v-else />
      </Button>
      <!-- <Button variant="ghost" class="button button-hover">
        <ArrowLeft />
      </Button>
      <Button variant="ghost" class="button button-hover">
        <ArrowRight />
      </Button> -->
    </div>
    <div class="flex gap-2">
      <Button variant="ghost" class="button button-hover" @click="bottom = !bottom">
        <PanelBottom v-if="bottom" />
        <PanelBottomOpen v-else />
      </Button>
      <Button variant="ghost" class="button button-hover" @click="right = !right">
        <PanelRight v-if="right" />
        <PanelRightOpen v-else />
      </Button>
    </div>
  </div>
</template>
<script lang="ts" setup>
import Button from "@/components/ui/button/Button.vue";
import {
  ArrowLeft,
  ArrowRight,
  PanelLeft,
  PanelRight,
  PanelRightOpen,
  PanelLeftOpen,
  PanelBottom,
  PanelBottomOpen,
} from "@lucide/vue";

const left = defineModel<boolean>("left");
const right = defineModel<boolean>("right");
const bottom = defineModel<boolean>("bottom");

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
