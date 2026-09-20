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
          <Button size="icon-sm" variant="ghost" @click="editProfile(profile)">
            <Bolt />
          </Button>
          <Button size="icon-sm" variant="ghost" @click="remove(profile)">
            <Trash />
          </Button>
        </ItemActions>
      </Item>
    </div>
  </section>

  <Dialog v-model:open="showDialog">
    <form>
      <DialogContent
        @pointer-down-outside="(event) => event.preventDefault()"
        @escape-key-down="(event) => event.preventDefault()"
      >
        <DialogHeader>
          <DialogTitle>{{ draft.id ? "编辑配置" : "新增配置" }}</DialogTitle>
          <div class="mt-2 gap-2 flex flex-col">
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
              <div class="flex items-center gap-3">
                <Checkbox v-model="draft.isDefault" />
                <FieldDescription>设为默认</FieldDescription>
              </div>
            </Field>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button
            class="button-no-shadow"
            variant="outline"
            @click="showDialog = false"
          >
            取消
          </Button>
          <Button type="submit" @click="save">保存</Button>
        </DialogFooter>
      </DialogContent>
    </form>
  </Dialog>
</template>

<script lang="ts" setup>
import type { ModelProfileSummary } from "@hcode/agent-protocol";
import { storeToRefs } from "pinia";
import Button from "@/components/ui/button/Button.vue";
import Input from "@/components/ui/input/Input.vue";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { useAgentStore } from "@/stores/agent";
import { Trash, Bolt } from "@lucide/vue";
import { toast } from "vue-sonner";

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
const showDialog = ref(false);

const { profiles, availableModels } = storeToRefs(agent);
const draft = reactive<ProfileDraft>(emptyDraft());

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
  // if (
  //   !draft.name.trim() ||
  //   !draft.provider.trim() ||
  //   !validBaseUrl() ||
  //   !draft.model.trim()
  // ) {
  //   errorMessage.value = "请完整填写配置名称、Provider、Base URL 和模型";
  //   return;
  // }
  // if (!editing.value && !draft.apiKey.trim()) {
  //   errorMessage.value = "新配置需要填写 API Key";
  //   return;
  // }

  try {
    const profile = await agent.saveProfile({
      id: draft.id || undefined,
      name: draft.name.trim(),
      provider: draft.provider.trim(),
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim() || undefined,
      isDefault: draft.isDefault,
    });
    if (profile.id) {
      editProfile(profile);
    }
    showDialog.value = false;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "操作失败");
  }
}
async function remove(id: string) {
  try {
    await agent.removeProfile(id);
    startNew();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "操作失败");
  }
}

onMounted(async () => {
  agent.initialize();
});
</script>
