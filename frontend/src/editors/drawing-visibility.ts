/** Hide an unreviewed molecular scene while keeping native Undo/Open usable. */
export function drawingVisibility(document: Document) {
  const attribute = "data-xdde-drawing-visible";
  const root = document.documentElement;
  const prior = root.getAttribute(attribute);
  const style = document.createElement("style");
  style.textContent = `html[${attribute}="false"] [role="application"] { visibility: hidden; }`;
  document.head.append(style);
  let last: string | null = null;
  return {
    show(visible: boolean) {
      last = String(visible);
      root.setAttribute(attribute, last);
    },
    dispose() {
      style.remove();
      if (root.getAttribute(attribute) !== last) return;
      if (prior === null) root.removeAttribute(attribute);
      else root.setAttribute(attribute, prior);
    },
  };
}
