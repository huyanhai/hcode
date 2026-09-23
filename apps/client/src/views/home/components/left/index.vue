<template>
  <div class="flex flex-col h-full">
    <div class="pt-14 px-2 flex h-full flex-col gap-4 flex-1">
      <Button class="menu-button" variant="ghost" @click="startNewSession">
        <SquarePen animateOnHover triggerTarget="parent" />
        新会话
      </Button>
      <div class="min-h-0 flex-1 flex flex-col gap-1">
        <ActionsButton @click="showProject = !showProject">
          <div class="text-sm text-muted-foreground flex gap-1 items-center">
            项目
            <ChevronDown :size="ICON_SIZE" v-if="showProject" />
            <ChevronUp :size="ICON_SIZE" v-else />
          </div>
          <template #action>
            <button
              class="button-hover"
              @click.stop="openCreateWorkspaceDialog"
            >
              <Plus :size="ICON_SIZE" />
            </button>
          </template>
        </ActionsButton>
        <template v-if="showProject">
          <p v-if="!workspaces.length" class="p-2 text-sm opacity-30">
            暂无项目
          </p>
          <FoldMenus
            v-else
            v-for="item in workspaces"
            :key="item.id"
            :title="item.name"
            @edit-workspace="openEditWorkspaceDialog(item)"
            @archive-workspace="archiveWorkspace(item)"
            @delete-workspace="deleteWorkspace(item)"
          >
            <p
              v-if="!sessionsByWorkspace[item.id]?.length"
              class="p-2 text-sm opacity-30"
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
                <button
                  class="button-hover"
                  type="button"
                  :aria-label="`归档${session.title}`"
                  :disabled="archiveSessionMutation.isPending.value"
                  @click.stop="archiveSessionMutation.mutate(session.id)"
                >
                  <Archive :size="ICON_SIZE" />
                </button>
              </template>
            </ActionsButton>
          </FoldMenus>
        </template>
      </div>
    </div>
    <Settings class="border-t p-2" />
  </div>
  <GlobalDialog
    :title="workspaceDialogMode === 'create' ? '创建项目' : '编辑项目'"
    v-model:open="workspaceDialogOpen"
    @submit="saveWorkspace"
  >
    <Field>
      <FieldLabel>项目名称</FieldLabel>
      <FieldContent>
        <Input v-model="workspaceDraft.name" placeholder="项目名称" />
      </FieldContent>
    </Field>
    <Field>
      <FieldLabel>文件夹</FieldLabel>
      <FieldContent>
        <div class="w-full overflow-hidden rounded-md border">
          <div
            v-for="(folder, index) in workspaceDraft.folders"
            :key="folder"
            class="flex min-w-0 items-center gap-2 border-b px-3 py-2 last:border-b-0"
          >
            <Folder class="size-4 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1 truncate" :title="folder">
              {{ folderName(folder) }}
            </span>
            <span
              v-if="index === 0"
              class="shrink-0 text-xs text-muted-foreground"
            >
              主要
            </span>
            <button
              v-else
              type="button"
              class="shrink-0 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              @click="setPrimaryFolder(index)"
            >
              设为主要
            </button>
            <button
              type="button"
              class="button-hover shrink-0"
              :aria-label="`删除文件夹 ${folderName(folder)}`"
              @click="removeFolder(index)"
            >
              <X :size="ICON_SIZE" />
            </button>
          </div>
          <Button
            type="button"
            class="w-full justify-start rounded-none border-0"
            variant="outline"
            @click="selectWorkspaceDirectory"
          >
            <FolderPlus />
            添加文件夹
          </Button>
        </div>
      </FieldContent>
    </Field>
  </GlobalDialog>
</template>

<script lang="ts" setup>
import { SquarePen } from "@respeak/lucide-motion-vue";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Archive,
  X,
  Folder,
  FolderPlus,
} from "@lucide/vue";
import Button from "@/components/ui/button/Button.vue";
import Settings from "./settings/index.vue";
import FoldMenus from "./fold-menus/index.vue";
import Input from "@/components/ui/input/Input.vue";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  createWorkspace,
  updateWorkspace,
  deleteWorkspace as deleteWorkspaceRequest,
  archiveWorkspace as archiveWorkspaceRequest,
  listWorkspaces,
  createSession,
  archiveSession,
  listSessions,
  type SessionSummary,
  type WorkspaceSummary,
} from "@/lib/model-profiles-api";
import { toast } from "vue-sonner";
import { ICON_SIZE } from "@/constants";
import { useSessionSelection } from "@/stores/session-selection";

const showProject = ref(true);

const workspaceDialogOpen = ref(false);
const workspaceDialogMode = ref<"create" | "edit">("create");
const editingWorkspaceId = ref("");
const workspaceDraft = reactive({ name: "", folders: [] as string[] });
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

const updateWorkspaceMutation = useMutation({
  mutationFn: updateWorkspace,
  onSuccess: async (workspace) => {
    selectedWorkspaceId.value = workspace.id;
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  },
  onError: (error) => {
    toast.error(error instanceof Error ? error.message : "编辑项目失败");
  },
});

const archiveWorkspaceMutation = useMutation({
  mutationFn: archiveWorkspaceRequest,
  onSuccess: async (workspace) => {
    if (selectedWorkspaceId.value === workspace.id) {
      selectedWorkspaceId.value = "";
      selectedSessionId.value = "";
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    ]);
  },
  onError: (error) => {
    toast.error(error instanceof Error ? error.message : "归档项目失败");
  },
});

const deleteWorkspaceMutation = useMutation({
  mutationFn: deleteWorkspaceRequest,
  onSuccess: async ({ id }) => {
    if (selectedWorkspaceId.value === id) {
      selectedWorkspaceId.value = "";
      selectedSessionId.value = "";
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    ]);
  },
  onError: (error) => {
    toast.error(error instanceof Error ? error.message : "删除项目失败");
  },
});

const archiveSessionMutation = useMutation({
  mutationFn: archiveSession,
  onSuccess: async (session) => {
    if (selectedSessionId.value === session.id) {
      selectedSessionId.value = "";
    }
    await queryClient.invalidateQueries({ queryKey: ["sessions"] });
  },
  onError: (error) => {
    toast.error(error instanceof Error ? error.message : "归档会话失败");
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
  openCreateWorkspaceDialog();
}

function openCreateWorkspaceDialog() {
  workspaceDialogMode.value = "create";
  editingWorkspaceId.value = "";
  workspaceDraft.name = "";
  workspaceDraft.folders = [];
  workspaceDialogOpen.value = true;
}

function openEditWorkspaceDialog(workspace: WorkspaceSummary) {
  workspaceDialogMode.value = "edit";
  editingWorkspaceId.value = workspace.id;
  workspaceDraft.name = workspace.name;
  workspaceDraft.folders = (workspace.folders?.length
    ? workspace.folders
    : [{ path: workspace.path, isPrimary: true }]
  ).map((folder) => folder.path);
  workspaceDialogOpen.value = true;
}

function archiveWorkspace(workspace: WorkspaceSummary) {
  if (archiveWorkspaceMutation.isPending.value) return;
  archiveWorkspaceMutation.mutate(workspace.id);
}

function deleteWorkspace(workspace: WorkspaceSummary) {
  if (deleteWorkspaceMutation.isPending.value) return;
  if (!window.confirm(`确定删除项目“${workspace.name}”吗？项目内的会话也会被删除。`))
    return;
  deleteWorkspaceMutation.mutate(workspace.id);
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
  if (workspaceDraft.folders.includes(path)) {
    toast.info("该文件夹已经添加");
    return;
  }
  workspaceDraft.folders.push(path);
  if (!workspaceDraft.name) {
    workspaceDraft.name = folderName(path);
  }
}

function folderName(path: string): string {
  const normalized = path.trim().replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function setPrimaryFolder(index: number) {
  if (index <= 0 || index >= workspaceDraft.folders.length) return;
  const [folder] = workspaceDraft.folders.splice(index, 1);
  if (folder) workspaceDraft.folders.unshift(folder);
}

function removeFolder(index: number) {
  if (index < 0 || index >= workspaceDraft.folders.length) return;
  workspaceDraft.folders.splice(index, 1);
}

async function saveWorkspace() {
  try {
    const input = {
      name: workspaceDraft.name.trim(),
      folders: workspaceDraft.folders,
    };
    if (!input.folders.length) {
      toast.error("请至少选择一个文件夹");
      return;
    }
    if (workspaceDialogMode.value === "edit") {
      await updateWorkspaceMutation.mutateAsync({
        ...input,
        id: editingWorkspaceId.value,
      });
    } else {
      await createWorkspaceMutation.mutateAsync(input);
    }
    workspaceDraft.name = "";
    workspaceDraft.folders = [];
    editingWorkspaceId.value = "";
    workspaceDialogOpen.value = false;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "保存项目失败");
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
