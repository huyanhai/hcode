<template>
  <section class="space-y-8">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-normal">模型配置</h1>
        <p class="mt-2 text-sm text-muted-foreground">
          管理本地 Provider，并从 Base URL 获取可用模型。
        </p>
      </div>
      <Button variant="outline" type="button" @click="startNew">
        <Plus :size="16" />
        新增配置
      </Button>
    </header>

    <div class="grid gap-8 xl:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]">
      <section class="min-w-0 space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-medium">已保存配置</h2>
          <span class="text-xs text-muted-foreground"
            >{{ profiles.length }} 个</span
          >
        </div>
        <div v-if="profiles.length" class="space-y-2">
          <button
            v-for="profile in profiles"
            :key="profile.id"
            type="button"
            class="w-full min-w-0 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/60"
            :class="
              profile.id === draft.id
                ? 'border-primary bg-primary/5'
                : 'border-border'
            "
            @click="editProfile(profile)"
          >
            <div class="flex min-w-0 items-center justify-between gap-3">
              <span class="truncate text-sm font-medium">{{
                profile.name
              }}</span>
              <span
                v-if="profile.isDefault"
                class="shrink-0 text-xs text-primary"
                >默认</span
              >
            </div>
            <p class="mt-1 truncate text-xs text-muted-foreground">
              {{ profile.provider }} · {{ profile.model }}
            </p>
            <p class="mt-1 truncate text-xs text-muted-foreground">
              {{ profile.baseUrl }}
            </p>
          </button>
        </div>
        <div
          v-else
          class="rounded-lg border border-dashed p-5 text-sm text-muted-foreground"
        >
          还没有模型配置，请先新增一个 Provider。
        </div>
      </section>

      <form class="min-w-0 max-w-2xl space-y-6">
        <div class="flex items-center justify-between border-b pb-4">
          <div>
            <h2 class="text-base font-medium"></h2>
            <p class="mt-1 text-xs text-muted-foreground">
              API Key 仅在本机 Runtime 中使用。
            </p>
          </div>
          <Button
            v-if="editing"
            variant="ghost"
            size="sm"
            type="button"
            :disabled="deleting"
            @click="remove"
          >
            <Trash2 :size="15" />
            删除
          </Button>
        </div>

        <div
          v-if="errorMessage"
          class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {{ errorMessage }}
        </div>
        <div
          v-if="successMessage"
          class="rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-sm text-green-700"
          role="status"
        >
          {{ successMessage }}
        </div>
        <div class="flex flex-wrap justify-end gap-3 border-t pt-5">
          <Button
            variant="outline"
            type="button"
            :disabled="modelsLoading"
            @click="fetchModels"
          >
            <LoaderCircle
              v-if="modelsLoading"
              class="animate-spin"
              :size="16"
            />
            <RefreshCw v-else :size="16" />
            {{ modelsLoading ? "获取中..." : "获取模型" }}
          </Button>
          <Button type="submit" :disabled="saving">
            <LoaderCircle v-if="saving" class="animate-spin" :size="16" />
            <Save v-else :size="16" />
            {{ saving ? "保存中..." : "保存配置" }}
          </Button>
        </div>
      </form>
    </div>
  </section>

  <Dialog open>
    <form @submit.prevent="save">
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{{ editing ? "编辑配置" : "新增配置" }}</DialogTitle>
          <div class="space-y-5">
            <Field orientation="horizontal">
              <FieldLabel class="w-32 shrink-0">配置名称</FieldLabel>
              <FieldContent
                ><Input v-model="draft.name" placeholder="例如：OpenAI 主账号"
              /></FieldContent>
            </Field>
            <Field orientation="horizontal">
              <FieldLabel class="w-32 shrink-0">Provider</FieldLabel>
              <FieldContent>
                <Input v-model="draft.provider" placeholder="openai" />
                <FieldDescription
                  >当前使用 OpenAI-compatible 协议。</FieldDescription
                >
              </FieldContent>
            </Field>
            <Field orientation="horizontal">
              <FieldLabel class="w-32 shrink-0">Base URL</FieldLabel>
              <FieldContent>
                <Input
                  v-model="draft.baseUrl"
                  type="url"
                  placeholder="https://api.openai.com/v1"
                />
                <FieldDescription
                  >Runtime 会请求此地址下的 /models。</FieldDescription
                >
              </FieldContent>
            </Field>
            <Field orientation="horizontal">
              <FieldLabel class="w-32 shrink-0">API Key</FieldLabel>
              <FieldContent>
                <Input
                  v-model="draft.apiKey"
                  type="password"
                  autocomplete="off"
                  :placeholder="editing ? apiKeyHint : 'sk-...'"
                />
                <FieldDescription>{{
                  editing
                    ? "留空表示复用同一 Base URL 的已保存 Key。"
                    : "Key 不会显示在配置列表或错误信息中。"
                }}</FieldDescription>
              </FieldContent>
            </Field>
            <Field orientation="horizontal">
              <FieldLabel class="w-32 shrink-0">模型</FieldLabel>
              <FieldContent>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button
                      class="w-full justify-between"
                      variant="outline"
                      type="button"
                      :disabled="!models.length"
                    >
                      <span class="truncate">{{
                        draft.model ||
                        (models.length ? "请选择模型" : "请先获取模型")
                      }}</span>
                      <ChevronDown :size="16" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" class="min-w-[18rem]">
                    <DropdownMenuRadioGroup
                      :model-value="draft.model"
                      @update:model-value="selectModel"
                    >
                      <DropdownMenuRadioItem
                        v-for="model in models"
                        :key="model"
                        :value="model"
                      >
                        <span class="max-w-[19rem] truncate">{{ model }}</span>
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <FieldDescription
                  >先获取模型，再选择用于聊天的默认模型。</FieldDescription
                >
              </FieldContent>
            </Field>
            <label class="flex cursor-pointer items-center gap-3 pl-32 text-sm">
              <input
                v-model="draft.isDefault"
                type="checkbox"
                class="size-4 accent-primary"
              />
              设为默认配置
            </label>
          </div>
        </DialogHeader>
        <DialogFooter>
          <DialogClose as-child>
            <Button variant="outline"> Cancel </Button>
          </DialogClose>
          <Button type="submit"> Save changes </Button>
        </DialogFooter>
      </DialogContent>
    </form>
  </Dialog>
</template>

<script lang="ts" setup>
import type { ModelProfileSummary } from "@hcode/agent-protocol";
import { storeToRefs } from "pinia";
import {
  ChevronDown,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "@lucide/vue";
import Button from "@/components/ui/button/Button.vue";
import Input from "@/components/ui/input/Input.vue";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAgentStore } from "@/stores/agent";

type ProfileDraft = {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isDefault: boolean;
};
const emptyDraft = (): ProfileDraft => ({
  id: "",
  name: "",
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "",
  isDefault: false,
});
const agent = useAgentStore();
const { profiles, availableModels, modelsLoading } = storeToRefs(agent);
const draft = reactive<ProfileDraft>(emptyDraft());
const editing = computed(() => Boolean(draft.id));
const apiKeyHint = ref("");
const models = ref<string[]>([]);
const saving = ref(false);
const deleting = ref(false);
const errorMessage = ref("");
const successMessage = ref("");

function startNew() {
  Object.assign(draft, emptyDraft());
  apiKeyHint.value = "";
  models.value = [];
  errorMessage.value = "";
  successMessage.value = "";
}
function editProfile(profile: ModelProfileSummary) {
  Object.assign(draft, {
    id: profile.id,
    name: profile.name,
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    apiKey: "",
    model: profile.model,
    isDefault: profile.isDefault,
  });
  apiKeyHint.value = profile.apiKeyHint ?? "已配置";
  models.value = availableModels.value[profile.id] ?? [];
  errorMessage.value = "";
  successMessage.value = "";
}
function selectModel(value: unknown) {
  if (typeof value === "string") draft.model = value;
}
function validBaseUrl() {
  try {
    const url = new URL(draft.baseUrl);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
async function fetchModels() {
  errorMessage.value = "";
  successMessage.value = "";
  if (!validBaseUrl()) {
    errorMessage.value = "请输入有效的 HTTP(S) Base URL";
    return;
  }
  if (!editing.value && !draft.apiKey.trim()) {
    errorMessage.value = "新配置需要填写 API Key";
    return;
  }
  try {
    models.value = await agent.loadModels({
      profileId: draft.id || undefined,
      baseUrl: draft.baseUrl,
      apiKey: draft.apiKey.trim() || undefined,
    });
    if (!models.value.includes(draft.model))
      draft.model = models.value[0] ?? "";
    successMessage.value = `已获取 ${models.value.length} 个模型`;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "获取模型失败";
  }
}
async function save() {
  errorMessage.value = "";
  successMessage.value = "";
  if (
    !draft.name.trim() ||
    !draft.provider.trim() ||
    !validBaseUrl() ||
    !draft.model.trim()
  ) {
    errorMessage.value = "请完整填写配置名称、Provider、Base URL 和模型";
    return;
  }
  if (!editing.value && !draft.apiKey.trim()) {
    errorMessage.value = "新配置需要填写 API Key";
    return;
  }
  saving.value = true;
  try {
    const loadedModels = [...models.value];
    const profile = await agent.saveProfile({
      id: draft.id || undefined,
      name: draft.name.trim(),
      provider: draft.provider.trim(),
      baseUrl: draft.baseUrl.trim(),
      model: draft.model.trim(),
      apiKey: draft.apiKey.trim() || undefined,
      isDefault: draft.isDefault,
    });
    if (loadedModels.length)
      availableModels.value = {
        ...availableModels.value,
        [profile.id]: loadedModels,
      };
    editProfile(profile);
    models.value = loadedModels;
    successMessage.value = "配置已保存";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "保存配置失败";
  } finally {
    saving.value = false;
  }
}
async function remove() {
  if (!draft.id || !window.confirm("确定删除当前模型配置吗？")) return;
  deleting.value = true;
  try {
    await agent.removeProfile(draft.id);
    startNew();
    successMessage.value = "配置已删除";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "删除配置失败";
  } finally {
    deleting.value = false;
  }
}

onMounted(async () => {
  try {
    await agent.initialize();
    if (profiles.value[0]) editProfile(profiles.value[0]);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "无法加载模型配置";
  }
});
</script>
