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
  };
  inspect?: () => void;
  destroy?: () => void;
};
