import { composePageAnnotation, HAnnotation } from "./annotation";
import type { AnnotationWindow, StyleChanges } from "./types";
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
    width: "36px",
    height: "36px",
    transform: "translate(-50%, -50%)",
    border: "2px solid #fff",
    borderRadius: "50%",
    background: "#3298ff",
    boxShadow: "0 1px 5px #0003",
    pointerEvents: "none",
    zIndex: "2147483647",
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
  // let destroyed = false;

  // function resolveSelector(selector: string): Element | null {
  //   let root: Document | ShadowRoot = document;
  //   let element: Element | null = null;
  //   const sections = selector.split(" >>> ");
  //   for (const [index, section] of sections.entries()) {
  //     element = root.querySelector(section);
  //     if (!element) return null;
  //     if (index < sections.length - 1) {
  //       if (!element.shadowRoot) return null;
  //       root = element.shadowRoot;
  //     }
  //   }
  //   return element;
  // }

  // function updateMarkers(): void {
  //   const host = page.__hcodeAnnotationMarkerHost;
  //   if (!host?.isConnected) return;
  //   for (const marker of Array.from(
  //     host.querySelectorAll<HTMLElement>("[data-hcode-annotation-marker]"),
  //   )) {
  //     const selector = marker.dataset.selector;
  //     const element = selector ? resolveSelector(selector) : null;
  //     if (!element) {
  //       marker.style.display = "none";
  //       continue;
  //     }
  //     const rect = element.getBoundingClientRect();
  //     Object.assign(marker.style, {
  //       display: "grid",
  //       left: `${Math.max(2, rect.left - 12)}px`,
  //       top: `${Math.max(2, rect.top - 12)}px`,
  //     });
  //   }
  // }

  // function addMarker(anchor: ElementAnchor): void {
  //   let host = page.__hcodeAnnotationMarkerHost;
  //   if (!host?.isConnected) {
  //     host = document.createElement("div");
  //     host.setAttribute("data-hcode-annotation-markers", "");
  //     Object.assign(host.style, {
  //       position: "fixed",
  //       inset: "0",
  //       zIndex: "2147483647",
  //       pointerEvents: "none",
  //     });
  //     document.documentElement.append(host);
  //     page.__hcodeAnnotationMarkerHost = host;
  //     page.__hcodeAnnotationMarkerUpdate = updateMarkers;
  //     window.addEventListener("resize", updateMarkers);
  //     window.addEventListener("scroll", updateMarkers, true);
  //   }
  //   const marker = document.createElement("div");
  //   marker.setAttribute("data-hcode-annotation-marker", "");
  //   marker.dataset.selector = anchor.selector;
  //   marker.textContent = String((page.__hcodeAnnotationMarkerCount ?? 0) + 1);
  //   page.__hcodeAnnotationMarkerCount = Number(marker.textContent);
  //   Object.assign(marker.style, {
  //     position: "fixed",
  //     display: "grid",
  //     placeItems: "center",
  //     width: "30px",
  //     height: "30px",
  //     borderRadius: "50%",
  //     background: "#3298ff",
  //     color: "#fff",
  //     boxShadow: "0 1px 5px #0003",
  //     font: '600 14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  //     pointerEvents: "none",
  //   });
  //   marker.setAttribute("aria-label", `批注 ${marker.textContent}`);
  //   host.append(marker);
  //   page.__hcodeAnnotationMarkerUpdate?.();
  // }

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

  async function click(event: MouseEvent): Promise<void> {
    if (isAnnotationEvent(event)) return;
    const element = choose({ x: event.clientX, y: event.clientY });
    if (!element) return;
    // event.preventDefault();
    // event.stopImmediatePropagation();
    if (annotation) return;
    annotation = true;
    index++;
    highlight.style.display = "none";
    hoverMarker.style.display = "none";
    restoreNativeCursor();
    const anchor = getSelectedElement(element);
    const markerOffset = {
      x: event.clientX - anchor.rect.x,
      y: event.clientY - anchor.rect.y,
    };
    const composer = composePageAnnotation(anchor, index, markerOffset);
    annotationInstance = composer;
    composer.addEventListener("annotation-confirm", finishAnnotation, {
      once: true,
    });
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

  function inspect() {
    if (inspecting) return;
    inspecting = true;
    hideNativeCursor();
    document.addEventListener("pointermove", move, true);
    document.addEventListener("click", click, true);
    window.addEventListener("keydown", keydown, true);
  }

  // function destroy() {
  //   if (destroyed) return;
  //   if (composerOpen) page.__hcodeAnnotationComposerCancel?.();
  //   composerOpen = false;
  //   stopInspecting();
  //   destroyed = true;
  //   highlight.remove();
  //   if (page.__hcodeAnnotationController === controller) {
  //     delete page.__hcodeAnnotationController;
  //   }
  //   if (page.__hcodeAnnotationCancel === destroy) {
  //     delete page.__hcodeAnnotationCancel;
  //   }
  // }

  page.inspect = inspect;
}

selectPageElement();

/** Preview stays local to the page until it is replaced, restored or navigated away. */
export function applyStylePreview(selector: string, changes: StyleChanges) {
  console.log(selector, changes);
  // const page = window as AnnotationWindow;
  // const old = page.__hcodeAnnotationPreview;
  // if (old) {
  //   for (const [property, previous] of old.previous) {
  //     old.element.style.setProperty(
  //       property,
  //       previous.value,
  //       previous.priority,
  //     );
  //   }
  //   delete page.__hcodeAnnotationPreview;
  // }
  // let root: Document | ShadowRoot = document;
  // let element: Element | null = null;
  // const sections = selector.split(" >>> ");
  // for (const [index, section] of sections.entries()) {
  //   element = root.querySelector(section);
  //   if (!element) return false;
  //   if (index < sections.length - 1) {
  //     if (!element.shadowRoot) return false;
  //     root = element.shadowRoot;
  //   }
  // }
  // if (!(element instanceof HTMLElement)) return false;
  // const previous = new Map<string, { value: string; priority: string }>();
  // const allowed = new Set([
  //   "color",
  //   "background-color",
  //   "opacity",
  //   "font-size",
  //   "font-family",
  //   "font-weight",
  // ]);
  // for (const [property, value] of Object.entries(changes)) {
  //   if (!allowed.has(property) || typeof value !== "string" || !value.trim())
  //     continue;
  //   previous.set(property, {
  //     value: element.style.getPropertyValue(property),
  //     priority: element.style.getPropertyPriority(property),
  //   });
  //   element.style.setProperty(property, value);
  // }
  // page.__hcodeAnnotationPreview = { element, previous };
  // return true;
}

/** Renders the annotation composer inside the active Electron <webview> page. */

export function registerIpc(webview: HTMLElement, cb?: EventListener) {
  webview.addEventListener("ipc-message", cb as EventListener);
}

export function unregisterIpc(webview: HTMLElement, cb?: EventListener) {
  webview.removeEventListener("ipc-message", cb as EventListener);
}
