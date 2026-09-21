<template>
  <div class="flex flex-col h-full">
    <div class="pt-14 px-2 flex h-full flex-col gap-4 flex-1">
      <Button class="menu-button" variant="ghost" @click="startNewSession">
        <SquarePen animateOnHover triggerTarget="parent" />
        新会话
      </Button>

      <div class="min-h-0 flex-1">
        <ActionsButton @click="showProject = !showProject">
          <div class="text-sm text-muted-foreground flex gap-1 items-center">
            项目
            <ChevronDown :size="ICON_SIZE" v-if="showProject" />
            <ChevronUp :size="ICON_SIZE" v-else />
          </div>
          <template #action>
            <SquarePen :size="10" />
          </template>
        </ActionsButton>
        <FoldMenus v-show="showProject" title="项目1">
          <ActionsButton>
            123
            <template #action>
              <Archive :size="10" />
            </template>
          </ActionsButton>
        </FoldMenus>
      </div>
    </div>
    <Settings class="border-t p-2" />
    <Dialog v-model:open="workspaceDialogOpen">
      <DialogContent>
        <form @submit.prevent="createSelectedWorkspace">
          <DialogHeader><DialogTitle>创建工作区</DialogTitle></DialogHeader>
          <div class="mt-4 space-y-3">
            <Field
              ><FieldLabel>工作区名称</FieldLabel
              ><FieldContent
                ><Input
                  v-model="workspaceDraft.name"
                  placeholder="例如：我的项目" /></FieldContent
            ></Field>
            <Field
              ><FieldLabel>工作区目录</FieldLabel
              ><FieldContent class="flex gap-2"
                ><Input
                  v-model="workspaceDraft.path"
                  readonly
                  placeholder="选择本地目录"
                /><Button
                  type="button"
                  variant="outline"
                  @click="selectWorkspaceDirectory"
                  >选择目录</Button
                ></FieldContent
              ></Field
            >
          </div>
          <DialogFooter class="mt-6"
            ><Button
              type="button"
              variant="outline"
              @click="workspaceDialogOpen = false"
              >取消</Button
            ><Button type="submit">创建工作区</Button></DialogFooter
          >
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script lang="ts" setup>
import { SquarePen } from "@respeak/lucide-motion-vue";
import { ChevronDown, ChevronUp } from "@lucide/vue";
import Button from "@/components/ui/button/Button.vue";
import Settings from "./settings/index.vue";
import FoldMenus from "./fold-menus/index.vue";
import Input from "@/components/ui/input/Input.vue";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  createWorkspace,
  listWorkspaces,
  type WorkspaceSummary,
} from "@/lib/model-profiles-api";
import { toast } from "vue-sonner";
import { ICON_SIZE } from "@/constants";

const showProject = ref(true);

const sessions = ref<{ id: string; title: string }[]>();
const workspaceDialogOpen = ref(false);
const workspaceDraft = reactive({ name: "", path: "" });
const selectedWorkspaceId = useLocalStorage<string>(
  "hcode:selected-workspace-id",
  "",
);
const queryClient = useQueryClient();
const workspacesQuery = useQuery({
  queryKey: ["workspaces"],
  queryFn: listWorkspaces,
});
const createWorkspaceMutation = useMutation({
  mutationFn: createWorkspace,
  onSuccess: (workspace) => {
    selectedWorkspaceId.value = workspace.id;
    queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  },
});

function startNewSession() {
  if (selectedWorkspaceId.value) return;
  workspaceDialogOpen.value = true;
}

async function selectWorkspaceDirectory() {
  if (!window.desktop) {
    toast.error("请在桌面客户端中选择本地目录");
    return;
  }
  const path = await window.desktop.selectDirectory();
  if (!path) return;
  workspaceDraft.path = path;
  if (!workspaceDraft.name) {
    workspaceDraft.name = path.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  }
}

async function createSelectedWorkspace() {
  try {
    await createWorkspaceMutation.mutateAsync({
      name: workspaceDraft.name.trim(),
      path: workspaceDraft.path.trim(),
    });
    workspaceDraft.name = "";
    workspaceDraft.path = "";
    workspaceDialogOpen.value = false;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "创建工作区失败");
  }
}

watch(workspacesQuery.data, (workspaces) => {
  if (
    selectedWorkspaceId.value &&
    !workspaces?.some(
      (workspace: WorkspaceSummary) =>
        workspace.id === selectedWorkspaceId.value,
    )
  )
    selectedWorkspaceId.value = "";
});
</script>
