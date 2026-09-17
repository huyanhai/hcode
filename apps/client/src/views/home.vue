<template>
  <Top
    class="absolute h-10 w-full z-10 pr-2"
    v-model:left="showLeft"
    v-model:right="showRight"
    v-model:bottom="showBottom"
  />
  <Layout
    v-model:left="showLeft"
    v-model:right="showRight"
    v-model:bottom="showBottom"
  >
    <template #left>
      <Left />
    </template>
    <template #middle>
      <div class="pt-8 px-4 h-full box-border">
        <Middle />
      </div>
    </template>
    <template #right>
      <Right />
    </template>
    <template #bottom>
      <Bottom />
    </template>
  </Layout>
</template>
<script lang="ts" setup>
import Layout from "@/layouts/index.vue";
import Top from "@/layouts/components/top/index.vue";
import Left from "@/layouts/components/left/index.vue";
import Middle from "@/layouts/components/middle/index.vue";
import Right from "@/layouts/components/right/index.vue";
import Bottom from "@/layouts/components/bottom/index.vue";

const showLeft = ref(true);
const showRight = ref(false);
const showBottom = ref(false);
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
