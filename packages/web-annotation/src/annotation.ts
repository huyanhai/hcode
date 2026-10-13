import { css, html, LitElement, unsafeCSS } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import type {
  EditableStyle,
  ElementAnchor,
  PageAnnotationSelection,
  StyleChanges,
} from "./types";
import { editableStyles } from "./types";
import annotationCss from "./annotation.css?inline";

const styleLabels: Record<EditableStyle, string> = {
  color: "文本颜色",
  "background-color": "背景",
  opacity: "透明度",
  "font-size": "字号",
  "font-family": "字体",
  "font-weight": "字重",
};

@customElement("h-annotation")
export class HAnnotation extends LitElement {
  static styles = css`
    ${unsafeCSS(annotationCss)}
  `;

  @property({ attribute: false })
  anchor?: ElementAnchor;

  @property({ attribute: false })
  markerOffset = { x: 0, y: 0 };

  @property({ type: Number })
  index = 0;

  @property({ type: Boolean })
  more = false;

  @state()
  private confirmed = false;

  @state()
  private comment = "";

  @state()
  private editedText = "";

  @state()
  private changes: StyleChanges = {};

  /** 实时从选中元素读取的计算样式 */
  @state()
  private liveStyles: Partial<Record<EditableStyle, string>> | null = null;

  /** 实时预览时被内联覆盖的属性 → 覆盖前的内联值（null 表示原本无内联） */
  private appliedInline = new Map<EditableStyle, string | null>();
  /** 实时预览文本时被替换的文本节点及其原始内容 */
  private previewTextNode: Text | null = null;
  private previewTextOriginal: string | null = null;

  @query(".card")
  private card?: HTMLElement;

  @query(".pin")
  private pin?: HTMLElement;

  connectedCallback(): void {
    super.connectedCallback();
    this.editedText = this.anchor?.label ?? "";
    this.refreshLiveStyles();
    window.addEventListener("keydown", this.onKeydown, true);
    window.addEventListener("resize", this.position);
    window.addEventListener("scroll", this.position, true);
  }

  disconnectedCallback(): void {
    window.removeEventListener("keydown", this.onKeydown, true);
    window.removeEventListener("resize", this.position);
    window.removeEventListener("scroll", this.position, true);
    super.disconnectedCallback();
  }

  private readonly toggleMore = (): void => {
    const opening = !this.more;
    // 展开面板时重新读取一次元素当前样式，保证面板展示的是实时值
    if (opening) this.refreshLiveStyles();
    this.more = opening;
  };

  private readonly onCommentInput = (event: Event): void => {
    this.comment = (event.currentTarget as HTMLTextAreaElement).value;
  };

  private readonly onTextInput = (event: Event): void => {
    this.editedText = (event.currentTarget as HTMLInputElement).value;
    this.applyTextPreview();
  };

  private readonly onStyleInput = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const name = input.dataset.field as EditableStyle | undefined;
    const anchor = this.anchor;
    if (!name || !anchor || !editableStyles.includes(name)) return;

    const value = input.value.trim();
    const next = { ...this.changes };
    if (value && value !== anchor.styles[name]) next[name] = value;
    else delete next[name];
    this.changes = next;
    this.applyPreviewStyle(
      name,
      value,
      !!value && value !== anchor.styles[name],
    );
  };

  private readonly onColorInput = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const name = input.dataset.field as EditableStyle | undefined;
    const anchor = this.anchor;
    if (!name || !anchor || !editableStyles.includes(name)) return;

    const value = input.value.trim();
    const changed =
      value.toLowerCase() !==
      this.toHexColor(anchor.styles[name]).toLowerCase();
    const next = { ...this.changes };
    if (changed) next[name] = value;
    else delete next[name];
    this.changes = next;
    this.applyPreviewStyle(name, value, changed);
  };

  /** 数值型字段的范围配置；非数值字段返回 null */
  private numberField(
    name: EditableStyle,
  ): { min: number; max: number; step: number } | null {
    if (name === "opacity") return { min: 0, max: 1, step: 0.01 };
    if (name === "font-size") return { min: 1, max: 200, step: 1 };
    if (name === "font-weight") return { min: 100, max: 900, step: 100 };
    return null;
  }

  /** 数值控件展示值：字号去掉单位只留数字，其余原样 */
  private toNumberValue(
    name: EditableStyle,
    value: string | undefined | null,
  ): string {
    const v = (value ?? "").trim();
    if (name === "font-size") {
      const match = v.match(/^(\d+(?:\.\d+)?)\s*(px|rem|em|pt)?$/i);
      return match ? match[1] : "";
    }
    return v;
  }

  private readonly onNumberInput = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const name = input.dataset.field as EditableStyle | undefined;
    const anchor = this.anchor;
    if (!name || !anchor || !editableStyles.includes(name)) return;

    const raw = input.value.trim();
    const next = { ...this.changes };
    // 清空视为改回原值
    if (!raw) {
      delete next[name];
      this.changes = next;
      this.applyPreviewStyle(name, "", false);
      return;
    }
    const value = name === "font-size" ? `${raw}px` : raw;
    const changed = value !== anchor.styles[name];
    if (changed) next[name] = value;
    else delete next[name];
    this.changes = next;
    this.applyPreviewStyle(name, value, changed);
  };

  /** 把 rgb()/rgba() 颜色转成 type=color 需要的 #rrggbb，解析失败时回退黑色 */
  private toHexColor(value: string | undefined | null): string {
    if (!value) return "#000000";
    const v = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    const match = v.match(
      /rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i,
    );
    if (match) {
      const hex = (n: string) =>
        Math.round(Number(n)).toString(16).padStart(2, "0");
      return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`;
    }
    return "#000000";
  }

  /** 解析 anchor.selector，找到页面上当前的目标元素 */
  private resolveTarget(): Element | null {
    const anchor = this.anchor;
    if (!anchor) return null;
    let searchRoot: Document | ShadowRoot = document;
    let target: Element | null = null;
    const parts = anchor.selector.split(" >>> ");
    for (const [partIndex, part] of parts.entries()) {
      target = searchRoot.querySelector(part);
      if (!target) break;
      if (partIndex < parts.length - 1 && target.shadowRoot) {
        searchRoot = target.shadowRoot;
      }
    }
    return target;
  }

  /** 从选中元素实时读取计算样式，刷新面板展示值 */
  private refreshLiveStyles(): void {
    const target = this.resolveTarget();
    if (!(target instanceof HTMLElement)) return;
    const computed = getComputedStyle(target);
    const next: Partial<Record<EditableStyle, string>> = {};
    for (const name of editableStyles) {
      next[name] = computed.getPropertyValue(name);
    }
    this.liveStyles = next;
  }

  /** 把单个属性的修改立即应用到页面元素上（实时预览）；changed 为 false 时还原原值 */
  private applyPreviewStyle(
    name: EditableStyle,
    value: string,
    changed: boolean,
  ): void {
    const target = this.resolveTarget();
    if (!(target instanceof HTMLElement)) return;
    if (changed) {
      if (!this.appliedInline.has(name)) {
        this.appliedInline.set(
          name,
          target.style.getPropertyValue(name) || null,
        );
      }
      target.style.setProperty(name, value);
    } else if (this.appliedInline.has(name)) {
      // 用户清空或改回了原值，恢复原来的内联样式
      const previous = this.appliedInline.get(name);
      if (previous) target.style.setProperty(name, previous);
      else target.style.removeProperty(name);
      this.appliedInline.delete(name);
    }
    this.refreshLiveStyles();
  }

  /** 把文本修改立即替换到元素的第一个非空文本节点上（实时预览） */
  private applyTextPreview(): void {
    const target = this.resolveTarget();
    if (!(target instanceof HTMLElement)) return;
    if (!this.previewTextNode) {
      const node = this.findFirstTextNode(target);
      if (!node) return;
      this.previewTextNode = node;
      this.previewTextOriginal = node.nodeValue;
    }
    this.previewTextNode.nodeValue = this.editedText;
  }

  private findFirstTextNode(root: Element): Text | null {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      if (text.nodeValue?.trim()) return text;
    }
    return null;
  }

  /** 取消时还原所有实时预览的修改 */
  private restorePreview(): void {
    const target = this.resolveTarget();
    if (target instanceof HTMLElement) {
      for (const [name, previous] of this.appliedInline) {
        if (previous) target.style.setProperty(name, previous);
        else target.style.removeProperty(name);
      }
    }
    this.appliedInline.clear();
    if (this.previewTextNode && this.previewTextOriginal !== null) {
      this.previewTextNode.nodeValue = this.previewTextOriginal;
    }
    this.previewTextNode = null;
    this.previewTextOriginal = null;
    this.refreshLiveStyles();
  }

  render() {
    const anchor = this.anchor;

    if (!anchor) return html``;
    if (this.confirmed) return html`<div class="pin">${this.index}</div>`;

    const ready = this.isReady;

    return html`
      <div class="pin">${this.index}</div>
      <section class="card ${this.more ? 'card__open' : ''}" role="dialog">
        <div class="main">
          <button
            class="icon ${this.more ? "active" : ""}"
            type="button"
            @click=${this.toggleMore}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-menu preview-icon"><path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/></svg>
          </button>
          <input
            placeholder="描述这些更改…"
            .value=${this.comment}
            @input=${this.onCommentInput}
          ></input>
          <button
            class="send ${ready ? "ready" : ""}"
            type="button"
            ?disabled=${!ready}
            @click=${this.confirm}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check preview-icon"><path d="M20 6 9 17l-5-5"/></svg>
          </button>
        </div>
        <div class="details ${this.more ? "open" : ""}">
          <div class="heading">
            <span>&lt;${anchor.tagName}&gt;</span><span>${this.index}</span>
          </div>
          <div class="fields">
            <label class="field">
              <span>文本</span>
              <input
                data-field="text"
                type="text"
                .value=${this.editedText}
                @input=${this.onTextInput}
              />
            </label>
            ${editableStyles.map(
              (name) => html`
                <label class="field">
                  <span>${styleLabels[name]}</span>
                  ${
                    name === "color" || name === "background-color"
                      ? html`<span class="color-field">
                          <input
                            class="color-input"
                            data-field=${name}
                            type="color"
                            .value=${this.toHexColor(
                              this.changes[name] ??
                                this.liveStyles?.[name] ??
                                anchor.styles[name],
                            )}
                            @input=${this.onColorInput}
                          />
                          <input
                            class="color-text"
                            data-field=${name}
                            type="text"
                            .value=${this.changes[name] ??
                            this.toHexColor(
                              this.liveStyles?.[name] ?? anchor.styles[name],
                            )}
                            @input=${this.onStyleInput}
                          />
                        </span>`
                      : this.numberField(name)
                        ? html`<input
                            class="number-input"
                            data-field=${name}
                            type="number"
                            min=${this.numberField(name)!.min}
                            max=${this.numberField(name)!.max}
                            step=${this.numberField(name)!.step}
                            .value=${this.toNumberValue(
                              name,
                              this.changes[name] ??
                                this.liveStyles?.[name] ??
                                anchor.styles[name],
                            )}
                            @input=${this.onNumberInput}
                          />`
                        : html`<input
                            data-field=${name}
                            type="text"
                            .value=${this.changes[name] ?? this.liveStyles?.[name] ?? anchor.styles[name] ?? ""}
                            @input=${this.onStyleInput}
                          />`
                  }
                </label>
              `,
            )}
          </div>
          <div class="actions">
            <button class="cancel" type="button" @click=${this.cancel}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x preview-icon"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>            </button>
            <button
              class="confirm"
              type="button"
              ?disabled=${!ready}
              @click=${this.confirm}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check preview-icon"><path d="M20 6 9 17l-5-5"/></svg>
            </button>
          </div>
        </div>
      </section>
    `;
  }

  protected updated(): void {
    this.position();
  }

  private get isReady(): boolean {
    return !!this.anchor && !!this.comment.trim();
  }

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.cancel();
  };

  private readonly position = (): void => {
    const anchor = this.anchor;
    const card = this.card;
    if (!anchor || !this.pin) return;

    const target = this.resolveTarget();
    const rect = target?.getBoundingClientRect() ?? anchor.rect;
    const markerX = rect.x + this.markerOffset.x;
    const markerY = rect.y + this.markerOffset.y;
    const visible =
      !!target &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.x + rect.width > 0 &&
      rect.y + rect.height > 0 &&
      rect.x < innerWidth &&
      rect.y < innerHeight;
    this.pin.style.display = visible ? "grid" : "none";
    const pinSize = this.pin.offsetWidth || 20;
    Object.assign(this.pin.style, {
      left: `${markerX - pinSize / 2}px`,
      top: `${markerY - pinSize / 2}px`,
    });

    if (!card) return;

    const width = card.offsetWidth || 250;
    const rightPosition = markerX + 14;
    const leftPosition = markerX - width - 14;
    const desiredLeft =
      rightPosition + width <= innerWidth - 12 ? rightPosition : leftPosition;
    const left = Math.max(12, Math.min(innerWidth - width - 12, desiredLeft));
    const height = card.offsetHeight || 60;
    // 顶部锚定：top 始终按折叠态高度计算，展开时顶部不动、向下展开
    const collapsedHeight = 42; // .main 40px + 上下边框
    const top = markerY - collapsedHeight / 2;
    Object.assign(card.style, {
      left: `${left}px`,
      top: `${Math.max(10, Math.min(innerHeight - height - 10, top))}px`,
    });
  };

  private readonly confirm = (): void => {
    const anchor = this.anchor;
    if (!anchor || !this.isReady) return;

    const comment = `${this.comment.trim()}${
      this.editedText.trim() !== anchor.label
        ? `\n文本：${anchor.label} → ${this.editedText.trim()}`
        : ""
    }`.trim();
    const selection: PageAnnotationSelection = {
      anchor,
      comment,
      changes: this.changes,
    };
    this.dispatchEvent(
      new CustomEvent<PageAnnotationSelection>("annotation-confirm", {
        detail: selection,
        bubbles: true,
        composed: true,
      }),
    );
    this.confirmed = true;
    // 确认后预览样式保留在页面上，清空还原记录
    this.appliedInline.clear();
    this.previewTextNode = null;
    this.previewTextOriginal = null;
    window.removeEventListener("keydown", this.onKeydown, true);
  };

  private readonly cancel = (): void => {
    // 取消时还原所有实时预览的修改
    this.restorePreview();
    this.dispatchEvent(
      new CustomEvent("annotation-cancel", {
        bubbles: true,
        composed: true,
      }),
    );
    this.remove();
  };
}

export function composePageAnnotation(
  anchor: ElementAnchor,
  index: number,
  markerOffset = { x: 0, y: 0 },
) {
  const composer = document.createElement("h-annotation") as HAnnotation;
  composer.anchor = anchor;
  composer.markerOffset = markerOffset;
  composer.index = index;
  document.documentElement.append(composer);
  requestAnimationFrame(() =>
    composer.shadowRoot?.querySelector("input")?.focus(),
  );
  return composer;
}
