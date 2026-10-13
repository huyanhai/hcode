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
  changes: StyleChanges;
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
  changes: StyleChanges;
  createdAt: string;
}

export interface ConfirmedWebAnnotation {
  annotation: WebAnnotation;
  screenshotPngBase64: string;
}

export type AnnotationWindow = Window & {
  inspectorBridge?: {
    inspectConfirmed?: (selection: any) => void;
    annotationExited?: () => void;
  };
  inspect?: () => void;
};
