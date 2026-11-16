/** Hide an unreviewed molecular scene while keeping native Undo/Open usable. */
export function drawingVisibility(document: Document) {
  const attribute = "data-xdde-drawing-visible";
  const root = document.documentElement;
  const prior = root.getAttribute(attribute);
  const style = document.createElement("style");
  // Miew loads the current drawing coordinates and can write them back; it is
  // not the platform's calculated-conformer/structure-inspection workflow.
  style.textContent = `
    html[${attribute}="false"] [role="application"] { visibility: hidden; }
    button[data-testid="3D Viewer button"] { display: none !important; }
  `;
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
