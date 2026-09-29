<template>
  <div class="flex justify-between items-center">
    <div :class="cn('flex gap-2', isDesktop && 'pl-20')">
      <Button
        variant="ghost"
        @click="left = !left"
        class="button button-hover no-drag"
      >
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
      <Button
        variant="ghost"
        class="button button-hover no-drag"
        @click="bottom = !bottom"
      >
        <PanelBottom v-if="bottom" />
        <PanelBottomOpen v-else />
      </Button>
      <Button
        variant="ghost"
        class="button button-hover no-drag"
        @click="right = !right"
      >
        <PanelRight v-if="right" />
        <PanelRightOpen v-else />
      </Button>
    </div>
  </div>
</template>
<script lang="ts" setup>
import Button from "@/components/ui/button/Button.vue";
import { cn } from "@/lib/utils";
import {
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

const isDesktop = computed(() => Boolean(window.desktop));

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
