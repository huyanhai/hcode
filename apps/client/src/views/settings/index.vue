<template>
  <div class="flex h-dvh min-h-0 flex-col bg-background text-foreground">
    <div
      class="h-10 shrink-0"
      style="-webkit-app-region: drag"
      aria-hidden="true"
    />
    <div class="flex min-h-0 flex-1">
      <aside class="flex w-56 shrink-0 flex-col border-r bg-muted/20">
        <div class="px-2 pb-5">
          <Button class="menu-button" variant="ghost" @click="goBack">
            <ArrowLeft :size="16" />
            返回应用
          </Button>
        </div>
        <nav class="px-2" aria-label="设置菜单">
          <Button class="menu-button" variant="ghost">
            <Settings2 :size="16" />
            模型配置
          </Button>
        </nav>
      </aside>
      <main class="min-w-0 flex-1 overflow-y-auto">
        <div class="mx-auto w-full max-w-5xl px-8 py-8 lg:px-12">
          <ModelProfileSettings />
        </div>
      </main>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ArrowLeft, Settings2 } from "@lucide/vue";
import { useRouter } from "vue-router";
import Button from "@/components/ui/button/Button.vue";
import ModelProfileSettings from "./ModelProfileSettings.vue";

const router = useRouter();
function goBack() {
  void router.push({ name: "home" });
}
</script>
