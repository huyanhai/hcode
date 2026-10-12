<template>
  <DragArea />
  <router-view v-slot="{ Component, route }">
    <KeepAlive include="HomeView">
      <component :is="Component" v-if="route.meta.keepAlive" />
    </KeepAlive>
    <component :is="Component" v-if="!route.meta.keepAlive" />
  </router-view>
  <Toaster position="top-center" :duration="2200" />
</template>
<script setup lang="ts">
import { Toaster } from "@/components/ui/sonner";
</script>
