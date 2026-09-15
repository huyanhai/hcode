<template>
  <router-view />
</template>
<script setup lang="ts">
import { usePreferencesStore } from "./stores/preferences";
import { watch } from "vue";
import { i18n } from './i18n'

const preferences = usePreferencesStore();
watch(
  () => preferences.locale,
  (locale) => {
    i18n.global.locale.value = locale;
    document.documentElement.lang = locale;
  },
  { immediate: true },
);
</script>
