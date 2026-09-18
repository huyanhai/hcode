<template>
  <div class="flex items-center text-sm">
    <Button class="menu-button" variant="ghost" type="button" @click="openSettings">
      <Settings :size="16" />
      设置
    </Button>
  </div>
</template>
<script lang="ts" setup>
import { Settings } from "@lucide/vue";
import { useRouter } from "vue-router";
import Button from "@/components/ui/button/Button.vue";

const router = useRouter();
function openSettings() { void router.push({ name: "settings" }); }
</script>
