import type { Component } from "vue";

/**
 * content 组件的事件监听器集合。
 * 参数写成 never[] ，是为了让任意签名的 handler（如 (url: string) => void）都能赋值进来。
 */
export type TTabListeners = Record<string, (...args: never[]) => void>;

export type TTabItem = {
  label: string;
  icon?: Component | Element;
  value: string | number;
  content: Component | Element | string;
  /** 透传给 content 组件的 props：动态组件不会自动传参，需要 Tabs 里 v-bind 下去 */
  props?: Record<string, unknown>;
  /** 监听 content 组件的事件：用闭包捕获自己的 value，回调里就知道事件来自哪个 tab */
  on?: TTabListeners;
};

export type TTabProps = {
  list: TTabItem[];
  contentClass?: string;
  closeable?: boolean;
  addAble?: boolean;
  /**
   * 非激活 tab 的内容是否保持挂载。
   * 默认 false（切走即卸载）；webview / iframe 这类卸载就会重载的组件建议开成 true。
   */
  keepAlive?: boolean;
};
