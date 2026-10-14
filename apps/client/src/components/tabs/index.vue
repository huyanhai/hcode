<template>
  <!--
    relative z-30：全局 DragArea（App.vue，fixed z-20）的拖拽矩形会盖住顶部 2rem，
    Chromium 的 -webkit-app-region 按绘制顺序取并/差集，no-drag 必须绘制在 drag
    之后才生效，所以这里抬高到 z-30，让 tab 条从窗口拖拽区里挖出来、可正常点击。
  -->
  <div
    :class="
      cn(
        'relative z-30 flex w-full h-full flex-col gap-6 no-drag',
        $attrs.class,
      )
    "
  >
    <Tabs
      v-model="currentValue"
      :unmount-on-hide="!keepAlive"
      class="gap-0 h-full w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <TabsList
        class="w-full justify-between rounded-none! items-center h-auto! px-2 h-12! bg-transparent!"
      >
        <div class="flex items-center gap-1 min-w-0 flex-1">
          <!--  
            tab 滚动区：w-max 让容器收缩为内容宽度（空间够时加号紧跟最后一个 tab），
            max-w 在有加号时预留加号按钮(size-6=24px) + 间距(gap-1=4px) 共 28px，
            空间不够时滚动区精确占满剩余宽度，加号贴住右缘不留空隙；
            没有加号时不预留，直接占满整行
           -->
          <div
            class="overflow-x-auto flex items-center gap-1 flex-none w-max [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            :class="addAble ? 'max-w-[calc(100%-1.75rem)]' : 'max-w-full'"
          >
            <TabsTrigger
              v-for="item in list"
              :key="item.value"
              class="flex-none flex w-56 min-w-50 p-2 pl-2 justify-between group/tab shadow-none! hover:bg-muted bg-transparent data-[state=active]:text-foreground!"
              :value="item.value"
            >
              <div class="flex items-center gap-1 w-1/2 flex-1">
                <component :is="item.icon" class="flex-none" v-if="item.icon" />
                <div class="truncate w-1/2 flex-auto text-left">
                  {{ item.label }}
                </div>
              </div>
              <div class="flex-none size-5" v-if="closeable">
                <button
                  @click="onClose(item.value)"
                  class="group-hover/tab:flex size-5 hover:bg-neutral-200 rounded-sm hidden items-center justify-center text-muted-foreground"
                >
                  <X />
                </button>
              </div>
            </TabsTrigger>
          </div>
          <button
            v-if="addAble"
            @click="emit('add')"
            class="hover:bg-muted size-6 rounded-sm text-sm items-center justify-center flex flex-none"
          >
            <Plus :size="18" />
          </button>
        </div>
        <div class="ml-2" v-if="$slots['tab-right']">
          <slot name="tab-right"></slot>
        </div>
      </TabsList>
      <!--
        动态组件是给 tab 传参 / 收事件的唯一入口：
        - :key 不能省，增删 tab 时 Vue 会就地复用节点，没 key 会把上一个 tab 的状态串到新 tab；
        - v-bind 展开配置项里的 props，v-on 展开事件监听器。
      -->

      <TabsContent
        :class="cn('h-full', contentClass)"
        v-for="item in list"
        :key="item.value"
        :value="item.value"
      >
        <component
          :is="item.content"
          :ref="(el: unknown) => registerInstance(item.value, el)"
          v-bind="item.props"
          v-on="listenersOf(item)"
        />
      </TabsContent>
    </Tabs>
  </div>
</template>
<script lang="ts" setup>
import { X, Plus } from "@lucide/vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ComponentPublicInstance } from "vue";
import type { TTabItem, TTabListeners, TTabProps } from "./types.js";
import { cn } from "@/lib/utils.js";

//#region Props
const props = withDefaults(defineProps<TTabProps>(), {
  closeable: false,
  addAble: false,
  keepAlive: false,
});
//#endregion
//#region Emits
const emit = defineEmits<{
  close: [TTabItem["value"]];
  add: [];
  /** content 组件走通用 action 通道抛出的事件，补上 tab 身份后往外抛 */
  "tab-action": [
    payload: { value: TTabItem["value"]; type: string; data?: unknown },
  ];
}>();
//#endregion
//#region Hooks
//#endregion
//#region Computed
/** 当前激活的 tab：支持 v-model 受控，不传则由组件内部自管 */
const active = defineModel<TTabItem["value"]>();

/**
 * 交给 reka-ui 的选中值。被关掉的 tab 或还没初始化时自动回退到第一个，
 * 保证 TabsRoot 拿到的永远是一个真实存在的 value。
 */
const currentValue = computed({
  get: () =>
    props.list.some((item) => item.value === active.value)
      ? active.value
      : props.list[0]?.value,
  set: (value) => {
    active.value = value;
  },
});

/** 各 tab 里 content 组件的实例，供宿主定向调用（未挂载的 tab 不在表里） */
const instances = new Map<TTabItem["value"], ComponentPublicInstance>();
//#endregion
//#region Watch
//#endregion
//#region Event
function onClose(value: TTabItem["value"]) {
  // 先按“还没删”的列表算出邻居，再通知宿主删除，
  // 这样关掉当前 tab 能顺势切到旁边那个，而不是跳回第一个
  const index = props.list.findIndex((item) => item.value === value);
  const rest = props.list.filter((item) => item.value !== value);
  emit("close", value);
  if (active.value !== value) return;
  active.value = rest[index < 0 ? 0 : Math.min(index, rest.length - 1)]?.value;
}
//#endregion
//#region Function
/** 收集 content 组件实例；卸载时 Vue 会传 null，顺手清理 */
function registerInstance(value: TTabItem["value"], instance: unknown) {
  if (instance) instances.set(value, instance as ComponentPublicInstance);
  else instances.delete(value);
}

/** 按 tab 取 content 组件实例，可调用它 defineExpose 出来的方法 */
function getInstance(value: TTabItem["value"]) {
  return instances.get(value);
}

/**
 * 组装 content 组件的事件监听器：
 * 1. 配置项自带的 on —— 闭包已捕获 tab 身份，回调里天然知道事件来自哪个 tab；
 * 2. 统一的 action 通道 —— 补上 tab 身份后再往外抛，宿主只监听 tab-action 即可。
 */
function listenersOf(item: TTabItem): TTabListeners {
  return {
    ...item.on,
    action: (payload: { type: string; data?: unknown }) =>
      emit("tab-action", { value: item.value, ...payload }),
  };
}
//#endregion
//#region Life Cycle
//#endregion
//#region Expose
defineExpose({ getInstance });
//#endregion
</script>
