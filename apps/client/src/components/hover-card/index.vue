<template>
  <HoverCardRoot :openDelay="100" :close-delay="100">
    <HoverCardTrigger>
      <slot />
    </HoverCardTrigger>
    <HoverCardPortal>
      <HoverCardContent
        :side="side"
        :sideOffset="offset"
        class="rounded-xl border p-1"
      >
        <slot name="content" />
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
</template>
<script lang="ts" setup>
const { offset, side } = defineProps<{
  offset?: number;
  side?: "top" | "right" | "bottom" | "left";
}>();
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
