<template>
  <Layout
    v-model:left="showLeft"
    v-model:right="showRight"
    v-model:bottom="showBottom"
  >
    <template #left><Left v-model="showLeft" /></template>
    <template #middle>
      <Middle v-model:right="showRight" v-model:left="showLeft" />
    </template>
    <template #right><Right v-model:right="showRight" /></template>
    <template #bottom><Bottom /></template>
  </Layout>
</template>
<script lang="ts" setup>
defineOptions({ name: "HomeView" });
import Layout from "@/components/layout/index.vue";
import Left from "./components/left/index.vue";
import Middle from "./components/middle/index.vue";
import Right from "./components/right/index.vue";
import Bottom from "./components/bottom/index.vue";

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
