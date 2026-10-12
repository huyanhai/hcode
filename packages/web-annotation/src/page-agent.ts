import type { ElementAnchor, StyleChanges } from "./index.js";

type AnnotationWindow = Window & {
  __hcodeAnnotationCancel?: () => void;
  __hcodeAnnotationComposerCancel?: () => void;
  __hcodeAnnotationPreview?: {
    element: HTMLElement;
    previous: Map<string, { value: string; priority: string }>;
  };
};

/** This function is serialized and executed in the active Electron <webview>. */
export function selectPageElement(): Promise<ElementAnchor | null> {
  const page = window as AnnotationWindow;
  page.__hcodeAnnotationCancel?.();
  return new Promise((resolve) => {
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
    let finished = false;

    function choose(point: { x: number; y: number }): HTMLElement | null {
      let element = document.elementFromPoint(point.x, point.y);
      while (element?.shadowRoot) {
        const inside = element.shadowRoot.elementFromPoint(point.x, point.y);
        if (!inside || inside === element) break;
        element = inside;
      }
      if (!(element instanceof HTMLElement)) return null;
      let fallback: HTMLElement | null = null;
      for (let current: HTMLElement | null = element; current && current !== document.body; current = current.parentElement) {
        const rect = current.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        fallback ??= current;
        if (current.matches("a,button,input,textarea,select,label,img,[role],[data-hcode-annotatable]")) return current;
        const directText = Array.from(current.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim());
        if (directText && rect.width >= 24 && rect.height >= 16) return current;
      }
      return fallback;
    }

    function selectorFor(element: HTMLElement): string {
      const roots: string[] = [];
      let target: HTMLElement | null = element;
      while (target) {
        const sections: string[] = [];
        for (let current: HTMLElement | null = target; current && current !== document.body; current = current.parentElement) {
          let section = current.tagName.toLowerCase();
          if (current.id) {
            section += `#${CSS.escape(current.id)}`;
            sections.unshift(section);
            break;
          }
          const siblings = current.parentElement
            ? Array.from(current.parentElement.children).filter((item) => item.tagName === current!.tagName)
            : [];
          if (siblings.length > 1) section += `:nth-of-type(${siblings.indexOf(current) + 1})`;
          sections.unshift(section);
        }
        roots.unshift(sections.join(" > "));
        const root: Node = target.getRootNode();
        target = root instanceof ShadowRoot && root.host instanceof HTMLElement ? root.host : null;
      }
      return roots.join(" >>> ");
    }

    function finish(value: ElementAnchor | null): void {
      if (finished) return;
      finished = true;
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", keydown, true);
      highlight.remove();
      delete page.__hcodeAnnotationCancel;
      resolve(value);
    }

    function move(event: PointerEvent): void {
      const element = choose({ x: event.clientX, y: event.clientY });
      if (!element) {
        highlight.style.display = "none";
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
    }

    function click(event: MouseEvent): void {
      const element = choose({ x: event.clientX, y: event.clientY });
      if (!element) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const rect = element.getBoundingClientRect();
      const computed = getComputedStyle(element);
      const styles = {
        color: computed.color,
        "background-color": computed.backgroundColor,
        opacity: computed.opacity,
        "font-size": computed.fontSize,
        "font-family": computed.fontFamily,
        "font-weight": computed.fontWeight,
      };
      const text = (element.getAttribute("aria-label") || element.innerText || element.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
      const nearbyText = (element.parentElement?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 160);
      const selector = selectorFor(element);
      finish({
        kind: "element",
        pageUrl: location.href,
        pageTitle: document.title,
        selector,
        elementPath: selector,
        tagName: element.tagName.toLowerCase(),
        label: text || element.tagName.toLowerCase(),
        nearbyText,
        rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        styles,
      });
    }

    function keydown(event: KeyboardEvent): void {
      if (event.key === "Escape") finish(null);
    }

    page.__hcodeAnnotationCancel = () => finish(null);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", keydown, true);
  });
}

/** Preview stays local to the page until it is replaced, restored or navigated away. */
export function applyStylePreview(selector: string, changes: StyleChanges): boolean {
  const page = window as AnnotationWindow;
  const old = page.__hcodeAnnotationPreview;
  if (old) {
    for (const [property, previous] of old.previous) {
      old.element.style.setProperty(property, previous.value, previous.priority);
    }
    delete page.__hcodeAnnotationPreview;
  }
  let root: Document | ShadowRoot = document;
  let element: Element | null = null;
  const sections = selector.split(" >>> ");
  for (const [index, section] of sections.entries()) {
    element = root.querySelector(section);
    if (!element) return false;
    if (index < sections.length - 1) {
      if (!element.shadowRoot) return false;
      root = element.shadowRoot;
    }
  }
  if (!(element instanceof HTMLElement)) return false;
  const previous = new Map<string, { value: string; priority: string }>();
  const allowed = new Set(["color", "background-color", "opacity", "font-size", "font-family", "font-weight"]);
  for (const [property, value] of Object.entries(changes)) {
    if (!allowed.has(property) || typeof value !== "string" || !value.trim()) continue;
    previous.set(property, {
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    });
    element.style.setProperty(property, value);
  }
  page.__hcodeAnnotationPreview = { element, previous };
  return true;
}

/** Renders the annotation composer inside the active Electron <webview> page. */
export function composePageAnnotation(
  anchor: ElementAnchor,
  preview: (selector: string, changes: StyleChanges) => boolean,
): Promise<{ comment: string; changes: StyleChanges } | null> {
  return new Promise((resolve) => {
    const page = window as AnnotationWindow;
    page.__hcodeAnnotationComposerCancel?.();
    const host = document.createElement("div");
    host.setAttribute("data-hcode-annotation-composer", "");
    Object.assign(host.style, { position: "fixed", inset: "0", zIndex: "2147483647", pointerEvents: "none" });
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        *{box-sizing:border-box} .outline{position:fixed;border:2px solid #3986ff;background:rgba(57,134,255,.07);pointer-events:none}
        .pin{position:fixed;width:22px;height:22px;background:#3298ff;border-radius:50%;box-shadow:0 1px 5px #0002;pointer-events:none}
        .card{position:fixed;width:min(440px,calc(100vw - 24px));background:#fff;color:#242424;border:1px solid #e2e2e2;border-radius:22px;box-shadow:0 8px 30px #0002;pointer-events:auto;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
        .main{display:flex;align-items:center;gap:8px;min-height:52px;padding:6px 9px}.icon{border:0;background:none;color:#737373;border-radius:11px;width:34px;height:34px;font-size:22px;cursor:pointer}.icon:hover{background:#f3f3f3}.icon.active{background:#edf5ff;color:#3284ff}
        textarea{flex:1;min-width:0;resize:none;border:0;outline:0;font:inherit;line-height:22px;max-height:130px;min-height:24px;padding:4px;background:transparent;color:#222}textarea::placeholder{color:#bbb}
        .send{border:0;background:#bbb;color:white;border-radius:50%;width:34px;height:34px;font-size:19px;cursor:pointer}.send.ready{background:#4381f6}
        .details{display:none;border-top:1px solid #ececec}.details.open{display:block}.heading{background:#f6f6f6;color:#666;padding:9px 15px;display:flex;justify-content:space-between;font-family:monospace}
        .fields{padding:8px 15px;max-height:min(330px,45vh);overflow:auto}.field{display:grid;grid-template-columns:42% 58%;align-items:center;gap:6px;padding:6px 0;color:#666}.field input,.field select{width:100%;height:32px;border:1px solid #ddd;border-radius:10px;padding:0 10px;background:#fff;color:#222;font:inherit;outline:0}.field input:focus,.field select:focus{border-color:#4381f6}.color-control{position:relative}.color-control input{padding-left:39px}.swatch{position:absolute;left:7px;top:6px;width:23px;height:23px;border:1px solid #ddd;border-radius:8px;background:#222}
        .actions{display:flex;justify-content:space-between;border-top:1px solid #eee;padding:9px 12px}.cancel{background:#fff;border:1px solid #e4e4e4;border-radius:18px;padding:6px 12px;cursor:pointer}.confirm{background:#4381f6;color:#fff;border:0;border-radius:18px;padding:6px 14px;cursor:pointer}.confirm:disabled{background:#aaa}
      </style>
      <div class="outline"></div><div class="pin"></div>
      <div class="card" role="dialog" aria-label="网页批注">
        <div class="main"><button class="icon settings" title="编辑样式" aria-label="编辑样式">☷</button><textarea placeholder="描述这些更改…" rows="1" aria-label="批注内容"></textarea><button class="send" title="确认并截图" aria-label="确认并截图">✓</button></div>
        <div class="details"><div class="heading"><span class="tag"></span><span>⠿</span></div><div class="fields">
          <label class="field"><span>文本</span><input data-field="text" type="text"></label>
          <label class="field"><span>文本颜色</span><span class="color-control"><i class="swatch" data-swatch="color"></i><input data-field="color" type="text"></span></label>
          <label class="field"><span>背景</span><span class="color-control"><i class="swatch" data-swatch="background-color"></i><input data-field="background-color" type="text"></span></label>
          <label class="field"><span>Opacity</span><input data-field="opacity" type="text"></label>
          <label class="field"><span>字号</span><input data-field="font-size" type="text"></label>
          <label class="field"><span>字体</span><input data-field="font-family" type="text"></label>
          <label class="field"><span>字重</span><input data-field="font-weight" type="text"></label>
        </div><div class="actions"><button class="cancel">取消</button><button class="confirm">确认并截图</button></div></div>
      </div>`;
    document.documentElement.append(host);
    const card = root.querySelector<HTMLElement>(".card")!;
    const outline = root.querySelector<HTMLElement>(".outline")!;
    const pin = root.querySelector<HTMLElement>(".pin")!;
    const textarea = root.querySelector<HTMLTextAreaElement>("textarea")!;
    const details = root.querySelector<HTMLElement>(".details")!;
    const settings = root.querySelector<HTMLButtonElement>(".settings")!;
    const send = root.querySelector<HTMLButtonElement>(".send")!;
    const confirm = root.querySelector<HTMLButtonElement>(".confirm")!;
    const fields = Array.from(root.querySelectorAll<HTMLInputElement>("[data-field]"));
    root.querySelector<HTMLElement>(".tag")!.textContent = `<${anchor.tagName}>`;
    for (const field of fields) {
      const name = field.dataset.field;
      field.value = name === "text" ? anchor.label : (anchor.styles[name as keyof StyleChanges] ?? "");
    }
    for (const property of ["color", "background-color"]) {
      const swatch = root.querySelector<HTMLElement>(`[data-swatch="${property}"]`);
      if (swatch) swatch.style.background = anchor.styles[property as keyof StyleChanges] || "transparent";
    }
    function changes(): StyleChanges {
      const result: StyleChanges = {};
      for (const field of fields) {
        const name = field.dataset.field;
        if (name === "text") continue;
        if (!name) continue;
        const property = name as keyof StyleChanges;
        const value = field.value.trim();
        if (value && value !== anchor.styles[property]) result[property] = value;
      }
      return result;
    }
    function update(): void {
      const draft = changes();
      preview(anchor.selector, draft);
      for (const property of ["color", "background-color"]) {
        const swatch = root.querySelector<HTMLElement>(`[data-swatch="${property}"]`);
        const input = root.querySelector<HTMLInputElement>(`[data-field="${property}"]`);
        if (swatch && input) swatch.style.background = input.value || "transparent";
      }
      const ready = !!textarea.value.trim() || Object.keys(draft).length > 0 || fields[0]?.value.trim() !== anchor.label;
      send.classList.toggle("ready", ready);
      confirm.disabled = !ready;
    }
    function position(): void {
      let searchRoot: Document | ShadowRoot = document;
      let target: Element | null = null;
      const parts = anchor.selector.split(" >>> ");
      for (const [index, part] of parts.entries()) {
        target = searchRoot.querySelector(part);
        if (!target) break;
        if (index < parts.length - 1 && target.shadowRoot) searchRoot = target.shadowRoot;
      }
      const rect = target instanceof Element ? target.getBoundingClientRect() : anchor.rect;
      Object.assign(outline.style,{left:`${rect.x}px`,top:`${rect.y}px`,width:`${rect.width}px`,height:`${rect.height}px`});
      Object.assign(pin.style,{left:`${Math.max(2,rect.x-10)}px`,top:`${Math.max(2,rect.y-10)}px`});
      const width = Math.min(440,innerWidth-24);
      const left = Math.max(12,Math.min(innerWidth-width-12,rect.x+rect.width/2-width/2));
      const height = card.offsetHeight || 60;
      const top = rect.y > height + 24 ? rect.y-height-12 : rect.y+rect.height+14;
      Object.assign(card.style,{left:`${left}px`,top:`${Math.max(10,Math.min(innerHeight-height-10,top))}px`});
    }
    function finish(accepted: boolean): void {
      delete page.__hcodeAnnotationComposerCancel;
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      const result = accepted ? {comment: `${textarea.value.trim()}${fields[0]?.value.trim() !== anchor.label ? `\n文本：${anchor.label} → ${fields[0]?.value.trim()}` : ""}`.trim(), changes: changes()} : null;
      if (!accepted) preview(anchor.selector, {});
      host.remove();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(result)));
    }
    function keydown(event: KeyboardEvent): void { if (event.key === "Escape") finish(false); }
    settings.addEventListener("click",()=>{details.classList.toggle("open");settings.classList.toggle("active");position();});
    root.querySelector(".cancel")!.addEventListener("click",()=>finish(false));
    send.addEventListener("click",()=>{if(send.classList.contains("ready"))finish(true);});
    confirm.addEventListener("click",()=>finish(true));
    textarea.addEventListener("input",update);
    for (const field of fields) field.addEventListener("input",update);
    window.addEventListener("keydown",keydown,true);
    page.__hcodeAnnotationComposerCancel = () => finish(false);
    window.addEventListener("resize",position);
    window.addEventListener("scroll",position,true);
    position();update();textarea.focus();
  });
}
