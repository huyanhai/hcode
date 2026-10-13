import { composePageAnnotation, HAnnotation } from "./annotation";
import type { AnnotationWindow, PageAnnotationSelection } from "./types";
import { getSelectedElement } from "./utils/dom";

/** This function is serialized and executed in the active Electron <webview>. */
export function selectPageElement() {
  const page = window as AnnotationWindow;

  const highlight = document.createElement("div");
  highlight.setAttribute("data-hcode-annotation-highlight", "");
  Object.assign(highlight.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483647",
    border: "2px solid #1677ff",
    borderRadius: "3px",
    background: "rgba(22, 119, 255, 0.08)",
    boxSizing: "border-box",
    display: "none",
  });
  document.documentElement.append(highlight);

  const hoverMarker = document.createElement("div");
  hoverMarker.setAttribute("data-hcode-annotation-hover-marker", "");
  Object.assign(hoverMarker.style, {
    position: "fixed",
    display: "none",
    placeItems: "center",
    width: "20px",
    height: "20px",
    transform: "translate(-50%, -50%)",
    borderRadius: "50%",
    background: "#3298ff",
    boxShadow: "0 1px 5px #0002",
    pointerEvents: "none",
    zIndex: "2147483647",
    "border-bottom-left-radius": "4px",
    border: "1px solid #fff",
  });
  document.documentElement.append(hoverMarker);

  let originalCursor: { value: string; priority: string } | null = null;

  function hideNativeCursor(): void {
    if (!originalCursor) {
      originalCursor = {
        value: document.documentElement.style.getPropertyValue("cursor"),
        priority: document.documentElement.style.getPropertyPriority("cursor"),
      };
    }
    document.documentElement.style.setProperty("cursor", "none", "important");
  }

  function restoreNativeCursor(): void {
    if (!originalCursor) return;
    if (originalCursor.value) {
      document.documentElement.style.setProperty(
        "cursor",
        originalCursor.value,
        originalCursor.priority,
      );
    } else {
      document.documentElement.style.removeProperty("cursor");
    }
    originalCursor = null;
  }

  // marker索引
  let index = 0;
  // 处于审查中
  let inspecting = false;
  // 处于批注中
  let annotation = false;

  let annotationInstance: HAnnotation | null = null;

  function choose(point: { x: number; y: number }): HTMLElement | null {
    let element = document.elementFromPoint(point.x, point.y);
    while (element?.shadowRoot) {
      const inside = element.shadowRoot.elementFromPoint(point.x, point.y);
      if (!inside || inside === element) break;
      element = inside;
    }
    if (!(element instanceof HTMLElement)) return null;
    let fallback: HTMLElement | null = null;
    for (
      let current: HTMLElement | null = element;
      current && current !== document.body;
      current = current.parentElement
    ) {
      const rect = current.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      fallback ??= current;
      if (
        current.matches(
          "a,button,input,textarea,select,label,img,[role],[data-hcode-annotatable]",
        )
      )
        return current;
      const directText = Array.from(current.childNodes).some(
        (node) =>
          node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim(),
      );
      if (directText && rect.width >= 24 && rect.height >= 16) return current;
    }
    return fallback;
  }

  function move(event: PointerEvent): void {
    const element = choose({ x: event.clientX, y: event.clientY });
    if (!element || annotation || isAnnotationEvent(event)) {
      highlight.style.display = "none";
      hoverMarker.style.display = "none";
      return;
    }
    const rect = element.getBoundingClientRect();
    Object.assign(highlight.style, {
      display: "block",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    Object.assign(hoverMarker.style, {
      display: "grid",
      left: `${event.clientX}px`,
      top: `${event.clientY}px`,
    });
  }

  function isAnnotationEvent(event: Event): boolean {
    return event
      .composedPath()
      .some(
        (target) => target instanceof Element && target.matches("h-annotation"),
      );
  }

  function finishAnnotation(): void {
    annotation = false;
    annotationInstance = null;
    if (inspecting) hideNativeCursor();
  }

  /** 把确认结果（备注 + 最新样式）提交给宿主 */
  function submitAnnotation(selection: PageAnnotationSelection): void {
    const bridge = page.inspectorBridge ?? page.inspectConfirmed;
    if (!bridge?.inspectConfirmed) {
      console.warn(
        "[hcode-annotation] 未检测到宿主桥 window.inspectConfirmed，批注结果未提交",
        selection,
      );
      return;
    }
    bridge.inspectConfirmed(selection);
  }

  async function click(event: MouseEvent): Promise<void> {
    if (isAnnotationEvent(event)) return;
    const element = choose({ x: event.clientX, y: event.clientY });
    if (!element) return;
    if (annotation) return;
    annotation = true;
    highlight.style.display = "none";
    hoverMarker.style.display = "none";
    restoreNativeCursor();
    const anchor = getSelectedElement(element);
    const markerOffset = {
      x: event.clientX - anchor.rect.x,
      y: event.clientY - anchor.rect.y,
    };
    // 序号只在点击确认后才真正递增，编辑期间仅预览 index + 1
    const composer = composePageAnnotation(anchor, index + 1, markerOffset);
    annotationInstance = composer;
    composer.addEventListener(
      "annotation-confirm",
      (event) => {
        index++;
        submitAnnotation(
          (event as CustomEvent<PageAnnotationSelection>).detail,
        );
        finishAnnotation();
      },
      { once: true },
    );
    composer.addEventListener("annotation-cancel", finishAnnotation, {
      once: true,
    });
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !inspecting) return;

    if (annotationInstance?.isConnected) {
      annotationInstance = null;
      annotation = false;
      return;
    }

    annotationInstance = null;
    annotation = false;
    inspecting = false;
    highlight.style.display = "none";
    hoverMarker.style.display = "none";
    event.preventDefault();
    event.stopImmediatePropagation();
    stopInspecting();
  }

  function stopInspecting(): void {
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("click", click, true);
    window.removeEventListener("keydown", keydown, true);
    highlight.style.display = "none";
    hoverMarker.style.display = "none";
    restoreNativeCursor();
  }

  /** 遮罩元素被 destroy 移除过时，重新挂载，保证 inspect() 可重复进入 */
  function ensureOverlay(): void {
    if (!highlight.isConnected) document.documentElement.append(highlight);
    if (!hoverMarker.isConnected) document.documentElement.append(hoverMarker);
  }

  function inspect() {
    if (inspecting) return;
    inspecting = true;
    ensureOverlay();
    hideNativeCursor();
    document.addEventListener("pointermove", move, true);
    document.addEventListener("click", click, true);
    window.addEventListener("keydown", keydown, true);
  }

  /** 退出审查（hover）模式并清理所有临时元素 */
  function destroy(): void {
    inspecting = false;
    annotation = false;
    // 关掉正在编辑的批注卡片（会还原实时预览的样式）
    const composer = annotationInstance;
    annotationInstance = null;
    if (composer?.isConnected) composer.dismiss();
    stopInspecting();
    highlight.remove();
    hoverMarker.remove();
    restoreNativeCursor();
  }

  page.inspect = inspect;
  page.destroy = destroy;
}

selectPageElement();
