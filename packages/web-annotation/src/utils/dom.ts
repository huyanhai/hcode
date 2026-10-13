import type { ElementAnchor } from "../types";

function selectorFor(element: HTMLElement): string {
  const roots: string[] = [];
  let target: HTMLElement | null = element;

  while (target) {
    const sections: string[] = [];
    for (
      let current: HTMLElement | null = target;
      current && current !== document.body;
      current = current.parentElement
    ) {
      let section = current.tagName.toLowerCase();
      if (current.id) {
        section += `#${CSS.escape(current.id)}`;
        sections.unshift(section);
        break;
      }
      const siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter(
            (item) => item.tagName === current!.tagName,
          )
        : [];
      if (siblings.length > 1)
        section += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      sections.unshift(section);
    }
    roots.unshift(sections.join(" > "));
    const root: Node = target.getRootNode();
    target =
      root instanceof ShadowRoot && root.host instanceof HTMLElement
        ? root.host
        : null;
  }
  return roots.join(" >>> ");
}

export function getSelectedElement(element: HTMLElement): ElementAnchor {
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

  const text = (
    element.getAttribute("aria-label") ||
    element.innerText ||
    element.textContent ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  const nearbyText = (element.parentElement?.innerText || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  const selector = selectorFor(element);
  return {
    kind: "element",
    pageUrl: location.href,
    pageTitle: document.title,
    selector,
    elementPath: selector,
    tagName: element.tagName.toLowerCase(),
    label: text || element.tagName.toLowerCase(),
    nearbyText,
    rect: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    },
    styles,
  };
}
