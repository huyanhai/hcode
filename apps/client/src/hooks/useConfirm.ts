import type { Component } from "vue";
import { defineComponent, h, nextTick, reactive, render } from "vue";
import ConfirmDialog from "@/components/confirm-dialog/index.vue";

/** 确认弹窗语气：destructive 用于删除 / 覆盖等不可逆操作 */
export type ConfirmVariant = "default" | "destructive";

export interface ConfirmOptions {
  /** 标题，默认「操作确认」 */
  title?: string;
  /** 补充说明，建议写清影响范围 / 是否可恢复 */
  description?: string;
  /** 确认按钮文案，默认「确定」 */
  confirmText?: string;
  /** 取消按钮文案，默认「取消」 */
  cancelText?: string;
  /** 语气，默认为 default */
  variant?: ConfirmVariant;
  /** 自定义图标，传 null 可隐藏图标 */
  icon?: Component | null;
  /** 是否显示取消按钮，默认 true */
  showCancelButton?: boolean;
  /** 是否显示右上角关闭按钮，默认 true */
  showCloseButton?: boolean;
  /** 点击遮罩是否关闭，默认 true */
  closeOnClickOutside?: boolean;
  /** 按 Esc 是否关闭，默认 true */
  closeOnEscape?: boolean;
  /**
   * 点击确认后的回调，支持返回 Promise。
   * 返回 Promise 时确认按钮会进入 loading，直到 resolve 才关闭弹窗；
   * 若 reject，弹窗保持打开（便于用户重试）。
   */
  onConfirm?: () => unknown;
  /** 取消（含关闭按钮 / 遮罩 / Esc）后的回调 */
  onCancel?: () => unknown;
}

interface ConfirmTask {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

/** 与 ConfirmDialog 交互的共享状态 */
const state = reactive({
  open: false,
  loading: false,
  title: "操作确认",
  description: "",
  confirmText: "确定",
  cancelText: "取消",
  variant: "default" as ConfirmVariant,
  icon: null as Component | null,
  showCancelButton: true,
  showCloseButton: true,
  closeOnClickOutside: true,
  closeOnEscape: true,
});

/** 串行队列：同一时刻只展示一个确认框，多次调用按顺序依次弹出 */
const queue: ConfirmTask[] = [];
let activeTask: ConfirmTask | null = null;

let hostContainer: HTMLElement | null = null;

/**
 * 挂载宿主组件，仅在首次调用时执行一次，无需在 App.vue 中手动注册。
 * Tailwind 的主题变量挂在 :root 上，所以脱离应用上下文渲染也能正常显示。
 */
function mountHost() {
  if (hostContainer || typeof document === "undefined") return;

  const container = document.createElement("div");
  container.setAttribute("data-confirm-dialog-host", "");
  document.body.appendChild(container);

  const Host = defineComponent({
    name: "ConfirmDialogHost",
    setup() {
      return () =>
        h(ConfirmDialog, {
          open: state.open,
          title: state.title,
          description: state.description,
          confirmText: state.confirmText,
          cancelText: state.cancelText,
          variant: state.variant,
          icon: state.icon,
          loading: state.loading,
          showCancelButton: state.showCancelButton,
          showCloseButton: state.showCloseButton,
          closeOnClickOutside: state.closeOnClickOutside,
          closeOnEscape: state.closeOnEscape,
          "onUpdate:open": handleOpenChange,
          onConfirm: handleConfirm,
          onCancel: handleCancel,
        });
    },
  });

  render(h(Host), container);
  hostContainer = container;
}

function applyOptions(options: ConfirmOptions) {
  state.title = options.title ?? "操作确认";
  state.description = options.description ?? "";
  state.confirmText = options.confirmText ?? "确定";
  state.cancelText = options.cancelText ?? "取消";
  state.variant = options.variant ?? "default";
  state.icon = options.icon ?? null;
  state.showCancelButton = options.showCancelButton ?? true;
  state.showCloseButton = options.showCloseButton ?? true;
  state.closeOnClickOutside = options.closeOnClickOutside ?? true;
  state.closeOnEscape = options.closeOnEscape ?? true;
  state.loading = false;
}

function drain() {
  if (activeTask || queue.length === 0) return;

  const task = queue.shift();
  if (!task) return;

  activeTask = task;
  applyOptions(task.options);
  state.open = true;
}

/** 关闭当前弹窗并结束本次 Promise，等退场动画结束后再处理队列中的下一个 */
function finish(confirmed: boolean) {
  const task = activeTask;
  if (!task) return;

  activeTask = null;
  state.open = false;
  state.loading = false;
  task.resolve(confirmed);

  nextTick(() => {
    if (queue.length === 0) return;
    window.setTimeout(drain, 200);
  });
}

async function handleConfirm() {
  const task = activeTask;
  if (!task || state.loading) return;

  const { onConfirm } = task.options;

  if (onConfirm) {
    let result: unknown;
    try {
      result = onConfirm();
    } catch (error) {
      console.error("[useConfirm] onConfirm 执行失败：", error);
      return;
    }

    if (isThenable(result)) {
      state.loading = true;
      try {
        await result;
      } catch (error) {
        console.error("[useConfirm] onConfirm 执行失败：", error);
        state.loading = false;
        return;
      }
    }
  }

  finish(true);
}

function handleCancel() {
  const task = activeTask;
  if (!task || state.loading) return;

  const { onCancel } = task.options;
  finish(false);

  if (onCancel) {
    try {
      const result = onCancel();
      if (isThenable(result)) {
        result.then(undefined, (error: unknown) => {
          console.error("[useConfirm] onCancel 执行失败：", error);
        });
      }
    } catch (error) {
      console.error("[useConfirm] onCancel 执行失败：", error);
    }
  }
}

function handleOpenChange(value: boolean) {
  if (value) {
    state.open = true;
    return;
  }
  handleCancel();
}

/**
 * 打开确认弹窗（二次确认）。
 *
 * - 宿主自动挂载，不需要在 App.vue 中注册组件；
 * - 并发调用按顺序串行展示；
 * - 确认返回 true，取消 / 关闭按钮 / 遮罩 / Esc 返回 false。
 *
 * @example 删除前的二次确认
 * ```ts
 * const { confirm } = useConfirm();
 *
 * async function remove(id: string) {
 *   const ok = await confirm({
 *     title: "删除该配置？",
 *     description: "删除后无法恢复，该配置下的会话记录也会一并清除。",
 *     variant: "destructive",
 *     confirmText: "删除",
 *     // 返回 Promise：确认按钮自动 loading，成功后自动关闭弹窗
 *     onConfirm: () => deleteModelProfile(id),
 *   });
 *   if (!ok) return;
 *   toast.success("已删除");
 * }
 * ```
 */
export function confirm(options: ConfirmOptions = {}): Promise<boolean> {
  mountHost();

  return new Promise<boolean>((resolve) => {
    queue.push({ options, resolve });
    drain();
  });
}

/** 主动关闭当前确认弹窗，等价于用户点击取消（resolve 为 false） */
export function closeConfirm() {
  handleCancel();
}

export function useConfirm() {
  return { confirm, close: closeConfirm };
}
