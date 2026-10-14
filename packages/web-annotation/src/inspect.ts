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
    border: "2px solid #fff",
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
  /** 已首次确认过的卡片：再次 annotation-confirm 视为二次编辑的重新提交 */
  const submittedComposers = new WeakSet<HAnnotation>();
  /** 批注编辑中的目标元素：高亮边框锚定在它上面，直到确认/取消才清除 */
  let annotationTarget: HTMLElement | null = null;
  /**
   * 确认后的截图等待期：边框与 marker 保持显示，等宿主截图完成
   * （宿主回调 releaseAnnotationHighlight）后再清除，保证截图带边框。
   */
  let capturing = false;
  let captureFallbackTimer = 0;

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
    if (
      !element ||
      annotation ||
      capturing ||
      isAnnotationEvent(event)
    ) {
      // 批注编辑/截图等待期间高亮边框锚定在选中元素上，不随 hover 移动或隐藏
      if (!annotation && !capturing) highlight.style.display = "none";
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

  /** 把高亮边框对齐到批注目标元素当前位置（滚动/缩放时跟随） */
  function syncAnnotationHighlight(): void {
    if ((!annotation && !capturing) || !annotationTarget) return;
    const rect = annotationTarget.getBoundingClientRect();
    Object.assign(highlight.style, {
      display: "block",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  /** 宿主截图完成后调用：清除锚定边框，回到 hover 高亮模式 */
  function releaseAnnotationHighlight(): void {
    window.clearTimeout(captureFallbackTimer);
    capturing = false;
    annotationTarget = null;
    highlight.style.display = "none";
    if (inspecting) hideNativeCursor();
  }

  function finishAnnotation(): void {
    annotation = false;
    annotationInstance = null;
    annotationTarget = null;
    highlight.style.display = "none";
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
    if (annotation || capturing) return;
    const element = choose({ x: event.clientX, y: event.clientY });
    if (!element) return;
    annotation = true;
    annotationTarget = element;
    hoverMarker.style.display = "none";
    restoreNativeCursor();
    syncAnnotationHighlight();
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
        submittedComposers.add(composer);
        submitAnnotation({
          ...(event as CustomEvent<PageAnnotationSelection>).detail,
          pinIndex: index + 1,
        });
        index++;
        // 进入截图等待期：边框与 marker 保留在页面上，宿主截图完成后清除
        annotation = false;
        annotationInstance = null;
        capturing = true;
        // 兜底：宿主未响应时自动清除，避免边框一直残留
        window.clearTimeout(captureFallbackTimer);
        captureFallbackTimer = window.setTimeout(
          releaseAnnotationHighlight,
          1500,
        );
      },
      { once: true },
    );
    composer.addEventListener("annotation-cancel", finishAnnotation, {
      once: true,
    });
  }

  /** 通知宿主：页面侧已自行退出审查（如按 Esc），宿主同步按钮状态 */
  function notifyHostExited(): void {
    const bridge = page.inspectorBridge ?? page.inspectConfirmed;
    bridge?.annotationExited?.();
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
    notifyHostExited();
  }

  function stopInspecting(): void {
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("scroll", syncAnnotationHighlight, true);
    window.removeEventListener("resize", syncAnnotationHighlight);
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
    document.addEventListener("scroll", syncAnnotationHighlight, true);
    window.addEventListener("resize", syncAnnotationHighlight);
    window.addEventListener("keydown", keydown, true);
  }

  /** 退出审查（hover）模式并清理所有临时元素 */
  function destroy(): void {
    inspecting = false;
    annotation = false;
    annotationTarget = null;
    capturing = false;
    window.clearTimeout(captureFallbackTimer);
    // 关掉正在编辑的批注卡片（会还原实时预览的样式）
    const composer = annotationInstance;
    annotationInstance = null;
    if (composer?.isConnected) composer.dismiss();
    stopInspecting();
    highlight.remove();
    hoverMarker.remove();
    restoreNativeCursor();
  }

  function findComposer(pinIndex: number): HAnnotation | null {
    for (const el of document.querySelectorAll("h-annotation")) {
      if (el instanceof HAnnotation && el.index === pinIndex) return el;
    }
    return null;
  }

  page.inspect = inspect;
  page.destroy = destroy;
  page.releaseAnnotationHighlight = releaseAnnotationHighlight;
  page.editWebAnnotation = (pinIndex: number): boolean => {
    const target = findComposer(pinIndex);
    if (!target) return false;
    target.reveal();
    return true;
  };
  page.removeWebAnnotation = (pinIndex: number): boolean => {
    const target = findComposer(pinIndex);
    if (!target) return false;
    target.remove();
    return true;
  };

  // 二次编辑后的重新确认：click() 里的 once 监听只覆盖首次确认，
  // 这里用一个 document 级中继把已确认卡片的再次提交转发给宿主。
  // 脚本可能随页面加载重复注入，用标记防止监听器叠加。
  if (!page.__hcodeConfirmRelay) {
    page.__hcodeConfirmRelay = true;
    document.addEventListener("annotation-confirm", (event) => {
      const composer = event.target;
      if (!(composer instanceof HAnnotation)) return;
      if (!submittedComposers.has(composer)) return;
      submitAnnotation({
        ...(event as CustomEvent<PageAnnotationSelection>).detail,
        pinIndex: composer.index,
      });
    });
  }
}

selectPageElement();
