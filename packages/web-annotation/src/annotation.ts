import { css, html, LitElement, unsafeCSS } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
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

  @query(".card")
  private card?: HTMLElement;

  @query(".pin")
  private pin?: HTMLElement;

  connectedCallback(): void {
    super.connectedCallback();
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
    this.more = !this.more;
  };

  private readonly onCommentInput = (event: Event): void => {
    this.comment = (event.currentTarget as HTMLTextAreaElement).value;
  };

  private readonly onTextInput = (event: Event): void => {
    this.editedText = (event.currentTarget as HTMLInputElement).value;
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
  };

  render() {
    const anchor = this.anchor;

    if (!anchor) return html``;
    if (this.confirmed) return html`<div class="pin">${this.index}</div>`;

    const ready = this.isReady;

    return html`
      <div class="pin">${this.index}</div>
      <section class="card" role="dialog">
        <div class="main">
          <button
            class="icon ${this.more ? "active" : ""}"
            type="button"
            @click=${this.toggleMore}
          >
            ☷
          </button>
          <input
            placeholder="描述这些更改…"
            .value=${this.comment}
            @input=${this.onCommentInput}
          ></input>
          <button
            class="send ${ready ? "ready" : ""}"
            type="button"
            @click=${this.confirm}
          >
            ✓
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
                      ? html`<span class="color-control">
                          <i
                            class="swatch"
                            style=${styleMap({ background: this.changes[name] ?? anchor.styles[name] ?? "transparent" })}
                          ></i>
                          <input
                            data-field=${name}
                            type="text"
                            .value=${this.changes[name] ?? anchor.styles[name] ?? ""}
                            @input=${this.onStyleInput}
                          />
                        </span>`
                      : html`<input
                          data-field=${name}
                          type="text"
                          .value=${this.changes[name] ?? anchor.styles[name] ?? ""}
                          @input=${this.onStyleInput}
                        />`
                  }
                </label>
              `,
            )}
          </div>
          <div class="actions">
            <button class="cancel" type="button" @click=${this.cancel}>
              取消
            </button>
            <button
              class="confirm"
              type="button"
              ?disabled=${!ready}
              @click=${this.confirm}
            >
              确认并截图
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
    return !!this.anchor;
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
    Object.assign(this.pin.style, {
      left: `${markerX - 18}px`,
      top: `${markerY - 18}px`,
    });

    if (!card) return;

    const width = Math.min(440, innerWidth - 24);
    const rightPosition = markerX + 30;
    const leftPosition = markerX - width - 30;
    const desiredLeft =
      rightPosition + width <= innerWidth - 12 ? rightPosition : leftPosition;
    const left = Math.max(12, Math.min(innerWidth - width - 12, desiredLeft));
    const height = card.offsetHeight || 60;
    const top = markerY - height / 2;
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
    window.removeEventListener("keydown", this.onKeydown, true);
  };

  private readonly cancel = (): void => {
    console.log("执行销毁");
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
    composer.shadowRoot?.querySelector("textarea")?.focus(),
  );
  return composer;
}
