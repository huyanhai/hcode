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
            <button
              class="button-hover"
              @click.stop="workspaceDialogOpen = true"
            >
              <Plus :size="ICON_SIZE" />
            </button>
          </template>
        </ActionsButton>
        <template v-if="showProject">
          <p
            v-if="!workspaces.length"
            class="px-2 text-xs text-muted-foreground"
          >
            暂无工作区
          </p>
          <FoldMenus
            v-else
            v-for="item in workspaces"
            :key="item.id"
            :title="item.name"
            @create-session="createWorkspaceSession(item.id)"
          >
            <p
              v-if="!sessionsByWorkspace[item.id]?.length"
              class="px-8 py-1 text-xs text-muted-foreground"
            >
              暂无会话
            </p>
            <ActionsButton
              v-for="session in sessionsByWorkspace[item.id] ?? []"
              :key="session.id"
              :class="session.id === selectedSessionId ? 'bg-muted' : ''"
              @click="selectSession(item.id, session.id)"
            >
              {{ session.title }}
              <template #action>
                <button class="button-hover">
                  <Archive :size="ICON_SIZE" />
                </button>
              </template>
            </ActionsButton>
          </FoldMenus>
        </template>
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
import { ChevronDown, ChevronUp, Plus, Archive } from "@lucide/vue";
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
  createSession,
  listSessions,
  type SessionSummary,
  type WorkspaceSummary,
} from "@/lib/model-profiles-api";
import { toast } from "vue-sonner";
import { ICON_SIZE } from "@/constants";
import { useSessionSelection } from "@/stores/session-selection";

const showProject = ref(true);

const workspaceDialogOpen = ref(false);
const workspaceDraft = reactive({ name: "", path: "" });
const selectedWorkspaceId = useLocalStorage<string>(
  "hcode:selected-workspace-id",
  "",
);
const queryClient = useQueryClient();
const workspacesQuery = useQuery<WorkspaceSummary[]>({
  queryKey: ["workspaces"],
  queryFn: listWorkspaces,
});
const workspaces = computed<WorkspaceSummary[]>(
  () => workspacesQuery.data.value ?? [],
);
const sessionsQuery = useQuery<SessionSummary[]>({
  queryKey: ["sessions"],
  queryFn: () => listSessions(),
});
const sessionsByWorkspace = computed<Record<string, SessionSummary[]>>(() => {
  return (sessionsQuery.data.value ?? []).reduce<
    Record<string, SessionSummary[]>
  >((groups, session) => {
    (groups[session.workspaceId] ??= []).push(session);
    return groups;
  }, {});
});
const selectedSessionId = useSessionSelection();

const createWorkspaceMutation = useMutation({
  mutationFn: createWorkspace,
  onSuccess: (workspace) => {
    selectedWorkspaceId.value = workspace.id;
    queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  },
});

const createSessionMutation = useMutation({
  mutationFn: createSession,
  onSuccess: (session) => {
    selectedWorkspaceId.value = session.workspaceId;
    selectedSessionId.value = session.id;
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
  },
  onError: (error) => {
    toast.error(error instanceof Error ? error.message : "创建会话失败");
  },
});

function startNewSession() {
  if (selectedWorkspaceId.value) {
    void createWorkspaceSession(selectedWorkspaceId.value);
    return;
  }
  if (workspaces.value[0]) {
    selectedWorkspaceId.value = workspaces.value[0].id;
    void createWorkspaceSession(workspaces.value[0].id);
    return;
  }
  workspaceDialogOpen.value = true;
}

async function createWorkspaceSession(workspaceId: string) {
  if (createSessionMutation.isPending.value) return;
  try {
    await createSessionMutation.mutateAsync({ workspaceId });
  } catch {
    // onError already shows the request error.
  }
}

function selectSession(workspaceId: string, sessionId: string) {
  selectedWorkspaceId.value = workspaceId;
  selectedSessionId.value = sessionId;
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

watch(
  workspacesQuery.data,
  (items) => {
    if (!items?.length) {
      selectedWorkspaceId.value = "";
      return;
    }
    if (
      !items.some((workspace) => workspace.id === selectedWorkspaceId.value)
    ) {
      selectedWorkspaceId.value = items[0].id;
    }
  },
  { immediate: true },
);

watch(
  sessionsQuery.data,
  (items) => {
    if (!items?.length) {
      selectedSessionId.value = "";
      return;
    }
    const selected = items.find(
      (session) => session.id === selectedSessionId.value,
    );
    const next = selected ?? items[0];
    selectedSessionId.value = next.id;
    selectedWorkspaceId.value = next.workspaceId;
  },
  { immediate: true },
);
</script>
