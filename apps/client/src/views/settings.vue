<template>
  <div class="flex h-dvh min-h-0 flex-col bg-background text-foreground">
    <div class="h-10 shrink-0" style="-webkit-app-region: drag" aria-hidden="true" />
    <div class="flex min-h-0 flex-1">
      <aside class="flex w-56 shrink-0 flex-col border-r bg-muted/20">
        <div class="px-3 pb-5">
          <Button class="w-full justify-start gap-2" variant="ghost" type="button" @click="goBack">
            <ArrowLeft :size="16" />
            返回应用
          </Button>
        </div>
        <nav class="px-3" aria-label="设置菜单">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-lg bg-muted px-3 py-2 text-left text-sm font-medium"
            aria-current="page"
          >
            <Settings2 :size="16" />
            模型配置
          </button>
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
import ModelProfileSettings from "@/components/settings/model-profile-settings.vue";

const router = useRouter();
function goBack() { void router.push({ name: "home" }); }
</script>
