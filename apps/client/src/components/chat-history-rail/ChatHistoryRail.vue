<template>
  <div
    v-if="items.length"
    ref="railElement"
    class="flex w-6 items-center gap-2"
    @click="selectHoveredItem"
    @mouseleave="hoveredIndex = null"
    @mousemove="selectClosestMarker"
  >
    <div class="h-full w-px self-stretch bg-border/70" />
    <div
      class="flex max-h-[60vh] flex-col gap-2 overflow-y-auto py-1 no-scrollbar"
    >
      <button
        v-for="(item, index) in items"
        :key="item.id"
        :ref="(element) => setMarkerElement(element, index)"
        :class="[
          'block h-0.5 shrink-0 rounded-sm bg-muted-foreground/35 transition-[width,background-color] duration-200 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3',
          hoveredIndex === index ||
          (hoveredIndex === null && props.activeFn(item))
            ? 'bg-foreground!'
            : '',
        ]"
        :style="{ width: `${markerWidth(index)}px` }"
        type="button"
        @blur="clearHoveredMarker(index)"
        @focus="hoveredIndex = index"
        @mouseenter="hoveredIndex = index"
      >
        <span class="sr-only">{{ item.userPreview }}</span>
      </button>
    </div>
    <section
      v-if="hoveredItem && hoveredMarkerOffset !== null"
      class="pointer-events-none absolute left-10 z-20 flex w-80 max-w-[calc(100vw-5rem)] -translate-y-1/2 flex-col gap-2 overflow-hidden rounded-lg border border-border bg-background/95 p-3 text-left shadow backdrop-blur-md"
      :style="{ top: `${hoveredMarkerOffset}px` }"
      role="tooltip"
    >
      <p class="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
        {{ hoveredItem.userPreview }}
      </p>
      <div
        v-if="hoveredItem.assistantPreview"
        class="max-h-36 overflow-hidden opacity-50"
      >
        <Markdown :content="hoveredItem.assistantPreview" />
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup>
import type { ComponentPublicInstance } from "vue";
import Markdown from "@/components/markdown/index.vue";
import type { ChatHistoryRailItem } from "./types";

const props = defineProps<{
  activeFn: (item: ChatHistoryRailItem) => boolean;
  items: ChatHistoryRailItem[];
}>();
const emit = defineEmits<{
  select: [item: ChatHistoryRailItem];
}>();

const railElement = ref<HTMLElement>();
const markerElements = ref<(HTMLButtonElement | null)[]>([]);
const markerOffsets = ref<number[]>([]);
const hoveredIndex = ref<number | null>(null);

const hoveredItem = computed(() =>
  hoveredIndex.value === null ? undefined : props.items[hoveredIndex.value],
);
const hoveredMarkerOffset = computed(() =>
  hoveredIndex.value === null
    ? null
    : (markerOffsets.value[hoveredIndex.value] ?? null),
);

function setMarkerElement(
  element: Element | ComponentPublicInstance | null,
  index: number,
) {
  markerElements.value[index] =
    element instanceof HTMLButtonElement ? element : null;
}

function measureMarkerOffsets() {
  const rail = railElement.value;
  if (!rail) {
    markerOffsets.value = [];
    return;
  }
  const railTop = rail.getBoundingClientRect().top;
  markerOffsets.value = markerElements.value.map((marker) => {
    if (!marker) return 0;
    const rect = marker.getBoundingClientRect();
    return rect.top - railTop + rect.height / 2;
  });
}

function markerWidth(index: number): number {
  if (hoveredIndex.value === null) {
    const item = props.items[index];
    return item && props.activeFn(item) ? 14 : 6;
  }
  const distance = Math.abs(index - hoveredIndex.value);
  const influence = Math.max(0, 1 - distance / 3) ** 2;
  return 6 + influence * 18;
}

function selectClosestMarker(event: MouseEvent) {
  const rail = railElement.value;
  if (!rail || !markerOffsets.value.length) return;
  const offset = event.clientY - rail.getBoundingClientRect().top;
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  markerOffsets.value.forEach((markerOffset, index) => {
    const distance = Math.abs(markerOffset - offset);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  hoveredIndex.value = closestIndex;
}

function clearHoveredMarker(index: number) {
  if (hoveredIndex.value === index) hoveredIndex.value = null;
}

function selectHoveredItem() {
  const index = hoveredIndex.value;
  const item = index === null ? undefined : props.items[index];
  if (item) emit("select", item);
}

watch(
  () => props.items,
  () => nextTick(measureMarkerOffsets),
  { flush: "post" },
);
onMounted(() => {
  measureMarkerOffsets();
  window.addEventListener("resize", measureMarkerOffsets);
});
onBeforeUnmount(() =>
  window.removeEventListener("resize", measureMarkerOffsets),
);
</script>
