<template>
  <!--
    左侧目录树 + 右侧编辑区的可拖拽分栏，做法与 components/layout/index.vue 一致。
    面板会随 tab 动态挂载/卸载，reka splitter 要求每个面板都提供 id + order，
    否则尺寸状态会错乱；组 id 也要与 layout 的 main-layout 区分开。
  -->
  <header class="flex justify-between items-center p-2 border-b">
    <Select
      v-if="rootOptions.length"
      :model-value="root"
      @update:model-value="onRootSelect"
      class="mx-0 flex-none"
    >
      <SelectTrigger class="rounded-full shadow" size="sm" :title="root">
        <SelectValue placeholder="选择目录" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem
            v-for="option in rootOptions"
            :key="option.path"
            :value="option.path"
            :title="option.path"
          >
            {{ option.label }}
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
    <div class="flex-0">
      <div class="flex gap-2">
        <ButtonGroup v-if="store.activePath">
          <!--
            分裂按钮（split button）：主按钮 = 上次选的打开方式，点击直接执行；
            箭头 = 打开菜单换选项。菜单里选中即记住（RadioGroup）并立刻执行。
          -->
          <Button
            class="rounded-full shadow gap-1.5"
            variant="outline"
            size="sm"
            :title="selectedOpenWith.label"
            @click="runSelectedOpenWith"
          >
            <img
              v-if="selectedOpenWith.icon"
              :src="selectedOpenWith.icon"
              class="size-4 shrink-0 object-contain"
              alt=""
            />
            <component
              :is="selectedOpenWith.fallbackIcon"
              v-else-if="selectedOpenWith.fallbackIcon"
              :size="16"
            />
            {{ selectedOpenWith.label }}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child class="rounded-full shadow">
              <Button variant="outline" size="icon-sm">
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-40">
              <DropdownMenuRadioGroup v-model="rememberedOpenWith">
                <DropdownMenuRadioItem
                  v-for="app in availableApps"
                  :key="app.name"
                  :value="app.name"
                  @select="openWith(app.name)"
                >
                  <img
                    v-if="appIcons[app.name]"
                    :src="appIcons[app.name]"
                    class="size-5 shrink-0 object-contain"
                    alt=""
                  />
                  <component :is="app.icon" v-else :size="18" />
                  {{ app.label }}
                  <template #indicator-icon>
                    <Check class="size-3" />
                  </template>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="default" @select="openDefault">
                  <img
                    v-if="defaultAppIcon"
                    :src="defaultAppIcon"
                    class="size-5 shrink-0 object-contain"
                    alt=""
                  />
                  <AppWindow v-else :size="20" />
                  Default app
                  <template #indicator-icon>
                    <Check class="size-3" />
                  </template>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <!-- 一次性动作：不参与「记住上次选择」 -->
                <DropdownMenuItem @click="revealInFolder">
                  打开所在文件夹
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>

        <Button
          @click="toggleSidebar"
          variant="outline"
          size="icon-sm"
          class="rounded-full shadow"
        >
          <PanelLeftClose
            :size="14"
            :style="{ transform: sidebarOpen ? 'none' : 'rotate(180deg)' }"
          />
        </Button>
      </div>
    </div>
  </header>
  <ResizablePanelGroup
    id="file-manager"
    direction="horizontal"
    class="fm-root relative"
  >
    <ResizablePanel
      id="fm-sidebar"
      ref="sidebarRef"
      :order="0"
      :min-size="SIDEBAR_MIN_SIZE"
      :max-size="60"
      :default-size="sidebarDefaultSize"
      :collapsed-size="0"
      :collapsible="true"
      @resize="onSidebarResize"
    >
      <FileTree
        class="h-full"
        :items="store.tree"
        :expanded="store.expandedPaths"
        :active-path="store.activePath"
        :loading-paths="store.loadingPaths"
        :rowHeight="32"
        @update:expanded="onExpandedChange"
        @open="openFile"
      />
    </ResizablePanel>

    <!--
      :disabled = `折叠 && 非拖拽中`，两个约束缺一不可：
      1) 拖拽期间不能禁用：reka 在 disabled 变化时会注销 handle 的全局拖拽监听，
         松手时 dragging:false 丢失 → isDragging 卡死 → 展开按钮被 watch 守卫吞掉；
      2) 折叠后必须禁用：reka 命中判定是「handle rect ±5px」，侧栏折叠后本条分割线
         紧贴主布局的分割线（相距仅内边距），常驻注册会让两条线被同一次 pointerdown
         同时命中，拖主布局的线会连带把文件面板拽开。
      仍保留节点本身 —— reka 靠 DOM 查询统计 handle 数量，摘掉元素会让布局重算找不到它。
    -->
    <ResizableHandle
      class="fm-handle"
      :class="!sidebarOpen && 'is-collapsed'"
      :disabled="!sidebarOpen && !isDragging"
      @dragging="isDragging = $event"
    />

    <ResizablePanel id="fm-editor" :order="1" :min-size="30" class="relative">
      <div v-if="activeFile" class="h-full">
        <FileTabs
          :files="store.openFiles"
          :active-path="store.activePath"
          @select="store.setActive"
          @close="closeTab"
        />

        <FileEditor
          :key="activeFile.path"
          :file="activeFile"
          @change="onEditorChange"
          @save="save(activeFile.path)"
        />
      </div>
      <div
        v-else
        class="h-full flex items-center justify-center text-primary text-sm flex-col gap-2"
      >
        <File />
        从工作区目录树中选择文件
      </div>
    </ResizablePanel>
  </ResizablePanelGroup>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from "vue";
import {
  AppWindow,
  Check,
  ChevronDown,
  CodeXml,
  File,
  Hammer,
  PanelLeftClose,
  SquareTerminal,
  Terminal,
} from "lucide-vue-next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu/index";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable/index";
import FileEditor from "./FileEditor.vue";
import FileTabs from "./FileTabs.vue";
import FileTree from "./FileTree.vue";
import {
  FileConflictError,
  useFileManagerStore,
  type OpenFile,
} from "../store";
import type { FileNode, FileProvider, RootOption } from "../types";
import { useConfirm } from "@/hooks/useConfirm.js";

/** 侧栏最小占比（%），与侧栏面板的 `min-size` 保持一致，低于它就认为已折叠。 */
const SIDEBAR_MIN_SIZE = 15;
/** 首次挂载时侧栏占比。 */
const SIDEBAR_DEFAULT_SIZE = 40;

const props = withDefaults(
  defineProps<{
    provider: FileProvider;
    /** 文件树根目录。 */
    root: string;
    /** 侧栏顶部下拉框的可选目录（当前项目下的文件夹列表）。 */
    rootOptions?: RootOption[];
    /** 覆盖默认忽略列表。 */
    ignore?: string[];
    /** 是否监听外部文件变更。 */
    watch?: boolean;
    /** 关闭有未保存改动的标签时是否直接关闭（false 时触发 beforeunload 拦截）。 */
    forceClose?: boolean;
  }>(),
  { rootOptions: () => [] },
);

const emit = defineEmits<{
  (event: "error", error: Error): void;
  /** 下拉框换目录：由宿主更新根目录。 */
  (event: "update:root", path: string): void;
}>();

const { confirm } = useConfirm();
const store = useFileManagerStore();
const sidebarOpen = ref(true);
const sidebarDefaultSize = ref(SIDEBAR_DEFAULT_SIZE);
const isDragging = ref(false);
const status = ref("");
const stopWatch = ref<(() => void) | undefined>(undefined);

/**
 * 「打开」菜单的候选应用。
 * `name` 必须与 macOS /Applications 下的 .app 名一致；检测到已安装才显示。
 * Terminal 由系统自带（/System/Applications/Utilities），正常都会命中。
 */
const CANDIDATE_APPS = [
  { name: "Visual Studio Code", label: "VS Code", icon: CodeXml },
  { name: "Warp", label: "Warp", icon: SquareTerminal },
  { name: "Xcode", label: "Xcode", icon: Hammer },
  { name: "Terminal", label: "Terminal", icon: Terminal },
];

/** 应用检测结果（name → 安装状态 + 系统图标 dataURL），挂载时从主进程检测一次。 */
type ShellBridge = NonNullable<Window["desktop"]>["shell"];
type InstalledAppPayload = Awaited<
  ReturnType<ShellBridge["installedApps"]>
>["apps"][string];
const installedApps = ref<Record<string, InstalledAppPayload>>({});
const defaultAppIcon = ref<string | null>(null);
/** 当前工作区的 GitHub 仓库主页；不是 git 仓库 / 非 GitHub 远端时为 null，菜单隐藏该项。 */
const githubUrl = ref<string | null>(null);

const availableApps = computed(() =>
  CANDIDATE_APPS.filter((app) => installedApps.value[app.name]?.installed),
);

//#region 打开方式分裂按钮（split button）
/**
 * 上次选择的打开方式：应用名或 "default"。
 * 菜单里选中即记住并立刻执行；之后点主按钮就直接执行记住的方式。
 * 持久化到 localStorage，重启后仍生效。
 */
const OPEN_WITH_STORAGE_KEY = "file-manager.open-with";
const rememberedOpenWith = ref<string>("default");
try {
  const saved = localStorage.getItem(OPEN_WITH_STORAGE_KEY);
  if (saved) rememberedOpenWith.value = saved;
} catch {
  // localStorage 不可用（隐私模式等）就用默认值
}
watch(rememberedOpenWith, (value) => {
  try {
    localStorage.setItem(OPEN_WITH_STORAGE_KEY, value);
  } catch {
    // 写不进去就算了，不影响本次会话
  }
});

/** 主按钮当前展示的打开方式；记住的应用已卸载/未安装时回退 Default app。 */
const selectedOpenWith = computed<{
  label: string;
  icon: string | null;
  fallbackIcon: Component | null;
}>(() => {
  const name = rememberedOpenWith.value;
  if (name !== "default") {
    const app = availableApps.value.find((item) => item.name === name);
    if (app)
      return {
        label: app.label,
        icon: appIcons.value[app.name] ?? null,
        fallbackIcon: app.icon as Component,
      };
  }
  return {
    label: "Default app",
    icon: defaultAppIcon.value,
    fallbackIcon: AppWindow as Component,
  };
});

/** 点主按钮：直接执行记住的打开方式（应用失效时兜底系统默认应用）。 */
function runSelectedOpenWith(): void {
  const name = rememberedOpenWith.value;
  if (
    name !== "default" &&
    availableApps.value.some((item) => item.name === name)
  ) {
    openWith(name);
  } else {
    openDefault();
  }
}
//#endregion

/** 应用系统图标（dataURL），没有提取成功时返回 null 由模板回退到内置线条图标。 */
const appIcons = computed<Record<string, string>>(() =>
  Object.fromEntries(
    Object.entries(installedApps.value)
      .filter(([, info]) => info.icon)
      .map(([name, info]) => [name, info.icon as string]),
  ),
);

const sidebarRef = useTemplateRef<typeof ResizablePanel>("sidebarRef");

const activeFile = computed(() => store.activeFile);

/**
 * 目录下拉框切换。
 *
 * 这里不直接改 store——根目录由宿主（file-manager/index.vue）持有，
 * 换根会连带重建整棵树与标签页，交给宿主统一决策更安全。
 */
function onRootSelect(value: unknown): void {
  // reka 的 Select 值类型是 AcceptableValue（可能是 null / number），这里只接受字符串路径
  if (typeof value !== "string" || !value || value === props.root) return;
  emit("update:root", value);
}

/**
 * reka Splitter 在完成首次布局测量之前，collapse/expand 等命令式调用会
 * assert 抛错（"Panel size not found"）。该错误若发生在 Vue 的 mounted 钩子
 * flush 阶段会中断 post-flush 队列，导致整个应用后续挂载的弹层组件
 * （HoverCard / DropdownMenu 等 reka Portal）永远不渲染。
 * 这里统一兜底：捕获错误并在下一帧重试，直到 splitter 完成测量。
 */
function guardSplitter(action: () => void, retries = 10): void {
  try {
    action();
  } catch {
    if (retries > 0)
      requestAnimationFrame(() => guardSplitter(action, retries - 1));
  }
}

/**
 * 拖动分割线时同步侧栏开关。
 *
 * reka 允许把面板一路吸附折叠到 0 宽，这时尺寸会小于 `min-size`，
 * 必须把开关置为 false —— 否则下次点按钮会以为「本来就是展开的」而先折叠一次。
 */
function onSidebarResize(size: number): void {
  // 宿主把面板压成 0 宽时这里可能收到 NaN/Infinity，忽略以免误判开关状态
  if (!Number.isFinite(size)) return;
  if (size < SIDEBAR_MIN_SIZE) {
    sidebarOpen.value = false;
    return;
  }
  // 只在展开态记录宽度，避免把折叠时的 0 当成下次挂载的默认值
  sidebarDefaultSize.value = size;
  sidebarOpen.value = true;
}

function toggleSidebar(): void {
  sidebarOpen.value = !sidebarOpen.value;
}

watch(sidebarOpen, (open) => {
  // 拖拽过程中 reka 自己在改尺寸，这里再下一次命令会跟它打架
  if (isDragging.value) return;
  guardSplitter(() =>
    open ? sidebarRef.value?.expand() : sidebarRef.value?.collapse(),
  );
});

onMounted(async () => {
  try {
    await store.initialize({
      provider: props.provider,
      root: props.root,
      ignore: props.ignore,
    });
    if (props.watch !== false) stopWatch.value = store.startWatching();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    status.value = `初始化失败：${err.message}`;
    emit("error", err);
  }
});

/** 检测外部应用安装情况与 git 远端，决定「打开」菜单显示哪些项。 */
onMounted(async () => {
  const bridge = window.desktop?.shell;
  if (!bridge) return;
  try {
    const [appsResult, url] = await Promise.all([
      bridge.installedApps(CANDIDATE_APPS.map((app) => app.name)),
      bridge.githubUrl(props.root),
    ]);
    installedApps.value = appsResult.apps;
    defaultAppIcon.value = appsResult.defaultAppIcon;
    githubUrl.value = url;
  } catch (error) {
    // 检测失败只影响菜单项显隐，不阻断文件面板
    console.warn("[file-manager] 「打开」菜单初始化失败", error);
  }
});

onBeforeUnmount(() => {
  stopWatch.value?.();
});

/** 统一的错误处理：状态栏提示 + 向上抛给宿主。 */
async function guard(action: () => Promise<void>): Promise<void> {
  try {
    status.value = "";
    await action();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    status.value = err.message;
    emit("error", err);
  }
}

function flash(message: string): void {
  status.value = message;
  setTimeout(() => {
    if (status.value === message) status.value = "";
  }, 2000);
}

/**
 * 保存。
 *
 * 写入前 store 会比对磁盘的真实 mtime：若磁盘版本比打开时更新（外部改过 / 删过），
 * 就抛 FileConflictError —— 这里弹确认框由用户决定是否覆盖，而不是静默覆盖别人的改动。
 */
async function save(path?: string): Promise<void> {
  const target = path ?? store.activePath;
  const file = store.openFiles.find((item) => item.path === target);

  try {
    status.value = "";
    // 内容没变化时 store 是空操作，不能提示「已保存」误导用户
    if (await store.save(path)) flash("已保存");
  } catch (error) {
    if (error instanceof FileConflictError) {
      await resolveConflict(error, target, file);
      return;
    }
    const err = error instanceof Error ? error : new Error(String(error));
    status.value = err.message;
    emit("error", err);
  }
}

/** 磁盘版本已被外部改动：询问是否用本地内容覆盖。 */
async function resolveConflict(
  error: FileConflictError,
  path: string,
  file: OpenFile | undefined,
): Promise<void> {
  const name = file?.name ?? path.split("/").pop() ?? path;

  const overwrite = await confirm({
    variant: "destructive",
    title: error.kind === "deleted" ? "文件已被外部删除" : "文件已被外部修改",
    description:
      error.kind === "deleted"
        ? `${name} 已在磁盘上被删除，继续保存会重新创建该文件。`
        : `${name} 在磁盘上已被其他程序修改，继续保存会用你的版本覆盖磁盘上的内容。`,
    confirmText: "覆盖保存",
    cancelText: "取消",
  });

  if (!overwrite) {
    // 保留状态栏提示与标签页红点，用户可继续编辑后再决定
    status.value = error.message;
    return;
  }

  await guard(async () => {
    if (await store.save(path, { force: true })) flash("已保存");
  });
}

async function closeTab(path: string): Promise<void> {
  const file = store.openFiles.find((item) => item.path === path);
  if (!file) return;
  const dirty = file.content !== file.savedContent;

  if (dirty && !props.forceClose) {
    const choice = await confirm({
      title: "提示",
      description: `${file.name} 有未保存的修改，确定关闭？`,
    });

    if (!choice) return;
  }
  store.closeFile(path);
}

/** 编辑器内容变化：直接写回对应打开项，脏检查由 store 对比 savedContent 完成。 */
function onEditorChange(content: string): void {
  const file = store.openFiles.find(
    (item) => item.path === activeFile.value?.path,
  );
  if (file) file.content = content;
}

/** 展开项变化：由 store 补齐新展开目录的子节点（懒加载）。 */
function onExpandedChange(paths: string[]): void {
  void guard(() => store.setExpanded(paths));
}

/** 点击文件：打开并激活。 */
function openFile(path: string): void {
  void guard(() => store.openFile(path));
}

/** 用外部应用（VS Code / Warp / Xcode / Terminal）打开当前工作区。 */
function openWith(appName: string): void {
  void window.desktop?.shell.openWithApp(appName, store.activePath);
}

/** 用系统默认应用打开目录（目录即 Finder）。 */
function openDefault(): void {
  void window.desktop?.shell.openPath(store.activePath);
}

/**打开文件所在位置 */
function revealInFolder(): void {
  void window.desktop?.shell?.showItemInFolder(store.activePath);
}

/** 有未保存改动时拦截关闭，与主流编辑器一致。 */
function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!store.hasDirtyFiles) return;
  event.preventDefault();
  event.returnValue = "";
}

onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
onBeforeUnmount(() =>
  window.removeEventListener("beforeunload", onBeforeUnload),
);
</script>

<style scoped>
/* 折叠态 handle：宽度（含 after 伪元素命中区）清零并禁用指针事件。
   不用 disabled —— 那会让 reka 注销全局拖拽监听，dragging:false 丢失导致 isDragging 卡死 */
.fm-handle.is-collapsed {
  width: 0;
  min-width: 0;
  pointer-events: none;
}
</style>
