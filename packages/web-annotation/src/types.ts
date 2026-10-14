export interface AnnotationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementAnchor {
  kind: "element";
  pageUrl: string;
  pageTitle: string;
  selector: string;
  elementPath: string;
  tagName: string;
  label: string;
  nearbyText: string;
  rect: AnnotationRect;
  styles: Record<EditableStyle, string>;
}

export interface PageAnnotationSelection {
  anchor: ElementAnchor;
  comment: string;
  styles: Record<EditableStyle, string>;
  /** 页面内标记序号（pin 上显示的数字），宿主靠它定位/删除标记、关联输入框注释 */
  pinIndex?: number;
}

export const editableStyles = [
  "color",
  "background-color",
  "opacity",
  "font-size",
  "font-family",
  "font-weight",
] as const;

export type EditableStyle = (typeof editableStyles)[number];
export type StyleChanges = Partial<Record<EditableStyle, string>>;

export interface WebAnnotation {
  id: string;
  anchor: ElementAnchor;
  comment: string;
  /** 用户修改过的属性；可由 styles 与 anchor.styles 推导，未推导时为空 */
  changes?: StyleChanges;
  /** 提交时元素的最新样式值 */
  styles: Record<EditableStyle, string>;
  /** 页面内标记序号，二次编辑/删除时定位 pin */
  pinIndex?: number;
  createdAt: string;
}

export interface ConfirmedWebAnnotation {
  annotation: WebAnnotation;
  screenshotPngBase64: string;
}

export type AnnotationWindow = Window & {
  inspectorBridge?: {
    inspectConfirmed?: (selection: PageAnnotationSelection) => void;
    annotationExited?: () => void;
  };
  /** 宿主 webview-preload 注入的桥（contextBridge 暴露） */
  inspectConfirmed?: {
    inspectConfirmed?: (selection: PageAnnotationSelection) => void;
    annotationExited?: () => void;
  };
  inspect?: () => void;
  destroy?: () => void;
  /** 宿主截图完成后回调，清除批注边框 */
  releaseAnnotationHighlight?: () => void;
  /** 定位并重新打开指定序号的批注卡片（二次编辑），找不到返回 false */
  editWebAnnotation?: (pinIndex: number) => boolean;
  /** 移除指定序号的标记（pin），找不到返回 false */
  removeWebAnnotation?: (pinIndex: number) => boolean;
  /** 清除页面上全部批注标记并退出审查模式（宿主发送消息后调用） */
  clearWebAnnotation?: () => void;
  /** 防止脚本重复注入时重复挂 document 级监听 */
  __hcodeConfirmRelay?: boolean;
};
