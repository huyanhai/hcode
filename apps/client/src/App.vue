<template>
  <router-view v-slot="{ Component, route }">
    <KeepAlive include="HomeView">
      <component :is="Component" v-if="route.meta.keepAlive" />
    </KeepAlive>
    <component :is="Component" v-if="!route.meta.keepAlive" />
  </router-view>
</template>
<script setup lang="ts"></script>
