<template>
  <div class="h-full overflow-y-auto px-4 pt-14 pb-6 text-sm">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="font-medium">模型配置</h2>
        <p class="text-xs text-muted-foreground mt-1">API Key 仅保存在本机数据库</p>
      </div>
      <Button size="sm" variant="outline" @click="resetForm">新增</Button>
    </div>

    <div v-if="profiles.length" class="space-y-2 mb-6">
      <button
        v-for="profile in profiles"
        :key="profile.id"
        type="button"
        class="w-full rounded-lg border px-3 py-2 text-left hover:bg-muted/50"
        @click="editProfile(profile)"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="font-medium truncate">{{ profile.name }}</span>
          <span v-if="profile.isDefault" class="text-xs text-primary">默认</span>
        </div>
        <div class="text-xs text-muted-foreground truncate">{{ profile.provider }} / {{ profile.model }}</div>
        <div class="text-xs text-muted-foreground truncate">{{ profile.baseUrl }}</div>
      </button>
    </div>
    <p v-else class="text-xs text-muted-foreground mb-6">还没有模型配置。</p>

    <form class="space-y-3" @submit.prevent="save">
      <label class="block space-y-1"><span class="text-xs text-muted-foreground">名称</span><input v-model="form.name" class="settings-input" required /></label>
      <label class="block space-y-1"><span class="text-xs text-muted-foreground">Provider</span><input v-model="form.provider" class="settings-input" placeholder="openai" required /></label>
      <label class="block space-y-1"><span class="text-xs text-muted-foreground">模型</span><input v-model="form.model" class="settings-input" placeholder="gpt-4o-mini" required /></label>
      <label class="block space-y-1"><span class="text-xs text-muted-foreground">Base URL</span><input v-model="form.baseUrl" class="settings-input" placeholder="https://api.openai.com/v1" type="url" required /></label>
      <label class="block space-y-1"><span class="text-xs text-muted-foreground">API Key</span><input v-model="form.apiKey" class="settings-input" type="password" autocomplete="off" :placeholder="editing ? profileHint : 'sk-...'" :required="!editing" /></label>
      <label class="flex items-center gap-2 text-xs"><input v-model="form.isDefault" type="checkbox" />设为默认配置</label>
      <p v-if="errorMessage" class="text-xs text-destructive">{{ errorMessage }}</p>
      <Button class="w-full" type="submit" :disabled="saving">{{ saving ? "保存中..." : "保存配置" }}</Button>
    </form>
  </div>
</template>

<script lang="ts" setup>
import type { ModelProfileSummary } from "@hcode/agent-protocol";
import { storeToRefs } from "pinia";
import Button from "@/components/ui/button/Button.vue";
import { useAgentStore } from "@/stores/agent";

const agent = useAgentStore();
const { profiles } = storeToRefs(agent);
const editing = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const profileHint = ref("");
const form = reactive({ id: "", name: "", provider: "openai", model: "", baseUrl: "https://api.openai.com/v1", apiKey: "", isDefault: false });

function resetForm() {
  Object.assign(form, { id: "", name: "", provider: "openai", model: "", baseUrl: "https://api.openai.com/v1", apiKey: "", isDefault: false });
  editing.value = false;
  profileHint.value = "";
  errorMessage.value = "";
}

function editProfile(profile: ModelProfileSummary) {
  Object.assign(form, { id: profile.id, name: profile.name, provider: profile.provider, model: profile.model, baseUrl: profile.baseUrl, apiKey: "", isDefault: profile.isDefault });
  editing.value = true;
  profileHint.value = profile.apiKeyHint ?? "已配置";
}

async function save() {
  if (!window.agent) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    const response = await window.agent.request({ requestId: crypto.randomUUID(), type: "profile/upsert", payload: { ...form, apiKey: form.apiKey || undefined } });
    if (!response.ok) throw new Error(response.error?.message ?? "保存失败");
    await agent.refreshProfiles();
    resetForm();
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : String(error); }
  finally { saving.value = false; }
}

onMounted(async () => { try { await agent.initialize(); } catch (error) { errorMessage.value = error instanceof Error ? error.message : String(error); } });
</script>

<style scoped>
.settings-input { width: 100%; border: 1px solid hsl(var(--border)); border-radius: 0.5rem; background: transparent; padding: 0.5rem 0.625rem; outline: none; }
.settings-input:focus { border-color: hsl(var(--ring)); box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2); }
</style>
