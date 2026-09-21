<template>
  <section class="space-y-8">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-normal">模型配置</h1>
        <p class="mt-2 text-sm text-muted-foreground">
          管理本地 Provider，并从 Base URL 获取可用模型。
        </p>
      </div>
      <Button
        class="button-no-shadow"
        variant="outline"
        type="button"
        @click="startNew"
      >
        新增配置
      </Button>
    </header>

    <div>
      <Item v-for="profile in profiles" :key="profile.id" variant="outline">
        <ItemContent>
          <ItemTitle>
            {{ profile.name }}
            <Badge v-if="profile.isDefault"> 默认 </Badge>
          </ItemTitle>
          <ItemDescription>
            {{ profile.baseUrl }}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            @click="editProfile(profile)"
          >
            <Bolt />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            @click="remove(profile.id)"
          >
            <Trash />
          </Button>
        </ItemActions>
      </Item>
    </div>
  </section>

  <GlobalDialog
    v-model="showDialog"
    :title="draft.id ? '编辑' : '新增'"
    @submit="save"
  >
    <Field>
      <FieldLabel>配置名称</FieldLabel>
      <FieldContent>
        <Input v-model="draft.name" placeholder="例如：OpenAI 主账号" />
      </FieldContent>
    </Field>
    <Field>
      <FieldLabel>Provider</FieldLabel>
      <FieldContent>
        <Input v-model="draft.provider" placeholder="openai" />
      </FieldContent>
    </Field>
    <Field>
      <FieldLabel>Base URL</FieldLabel>
      <FieldContent>
        <Input
          v-model="draft.baseUrl"
          type="url"
          placeholder="https://api.openai.com/v1"
        />
      </FieldContent>
    </Field>
    <Field>
      <FieldLabel>API Key</FieldLabel>
      <FieldContent>
        <Input
          v-model="draft.apiKey"
          type="password"
          autocomplete="off"
          placeholder="sk-..."
        />
      </FieldContent>
    </Field>
    <Field>
      <FieldLabel>模型名称</FieldLabel>
      <FieldContent>
        <Input v-model="draft.model" placeholder="gpt-5.6-sol" />
      </FieldContent>
    </Field>
    <Field>
      <div class="flex items-center gap-3">
        <Checkbox v-model="draft.isDefault" />
        <FieldDescription>设为默认</FieldDescription>
      </div>
    </Field>
  </GlobalDialog>
</template>

<script lang="ts" setup>
import Button from "@/components/ui/button/Button.vue";
import Input from "@/components/ui/input/Input.vue";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Trash, Bolt } from "@lucide/vue";
import { toast } from "vue-sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import GlobalDialog from "@/components/global-dialog/index.vue";

import {
  deleteModelProfile,
  listModelProfiles,
  upsertModelProfile,
  type ModelProfileSummary,
} from "@/lib/model-profiles-api";

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
const showDialog = ref(false);

const draft = reactive<ProfileDraft>(emptyDraft());
const queryClient = useQueryClient();
const profilesQuery = useQuery({
  queryKey: ["model-profiles"],
  queryFn: listModelProfiles,
});
const profiles = computed<ModelProfileSummary[]>(
  () => profilesQuery.data.value ?? [],
);
const saveMutation = useMutation({
  mutationFn: upsertModelProfile,
  onSuccess: () =>
    queryClient.invalidateQueries({ queryKey: ["model-profiles"] }),
});
const deleteMutation = useMutation({
  mutationFn: deleteModelProfile,
  onSuccess: () =>
    queryClient.invalidateQueries({ queryKey: ["model-profiles"] }),
});

function startNew() {
  showDialog.value = true;
  Object.assign(draft, emptyDraft());
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
  showDialog.value = true;
}

async function save() {
  try {
    console.log("保存");
    await saveMutation.mutateAsync({
      id: draft.id || undefined,
      name: draft.name.trim(),
      provider: draft.provider.trim(),
      model: draft.model.trim(),
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim() || undefined,
      isDefault: draft.isDefault,
    });
    showDialog.value = false;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "操作失败");
  }
}
async function remove(id: string) {
  try {
    await deleteMutation.mutateAsync(id);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "操作失败");
  }
}

watch(
  () => profilesQuery.error.value,
  (error) => {
    if (error)
      toast.error(error instanceof Error ? error.message : "加载配置失败");
  },
);
</script>
