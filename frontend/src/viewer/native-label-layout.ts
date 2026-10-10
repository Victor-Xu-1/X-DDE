import { Vector2, type GLViewer, type Label, type XYZ } from "3dmol";
import { contactLabelLayout, type LabelBox } from "./contact-label-layout";

export interface NativeAnnotation {
  label: Label;
  layoutHidden: boolean;
}
/** Screen-space placement preserves the native molecular anchor. */
export function layoutNativeLabels(
  viewer: GLViewer,
  entries: NativeAnnotation[],
  ligand: XYZ[],
) {
  const bounds = viewer.getCanvas().getBoundingClientRect();
  const project = (point: XYZ) => {
    const screen = viewer.modelToScreen([point])[0];
    return { x: screen.x - bounds.left, y: screen.y - bounds.top };
  };
  const positions = ligand
    .map(project)
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  let protectedBox: LabelBox | null = null;
  if (positions.length) {
    const x = positions.map((p) => p.x),
      y = positions.map((p) => p.y);
    protectedBox = {
      x: Math.min(...x) - 8,
      y: Math.min(...y) - 8,
      width: Math.max(...x) - Math.min(...x) + 16,
      height: Math.max(...y) - Math.min(...y) + 16,
    };
  }
  // Only layout-hidden labels may reappear; explicit hidden choices are retained.
  const active = entries.filter(
    ({ label, layoutHidden }) => label.sprite.visible || layoutHidden,
  );
  const anchors = active.map(({ label }) => ({
    ...project(label.sprite.position),
    width: label.canvas.width * label.sprite.scale.x,
    height: label.canvas.height * label.sprite.scale.y,
  }));
  const boxes = contactLabelLayout(anchors, bounds, protectedBox);
  let changed = false;
  active.forEach((entry, index) => {
    const { label } = entry,
      box = boxes[index],
      visible = Boolean(box);
    entry.layoutHidden = !visible;
    if (label.sprite.visible !== visible) {
      label.sprite.visible = visible;
      changed = true;
    }
    if (!box || !label.sprite.material) return;
    const material = label.sprite.material,
      alignment = material.alignment;
    const left = (((alignment?.x ?? 1) - 1) * anchors[index].width) / 2;
    const top = (-((alignment?.y ?? -1) + 1) * anchors[index].height) / 2;
    const offset = new Vector2(
      (box.x - anchors[index].x - left) / label.sprite.scale.x,
      (anchors[index].y + top - box.y) / label.sprite.scale.y,
    );
    const previous = material.screenOffset;
    if (
      !previous ||
      Math.abs(previous.x - offset.x) > 0.5 ||
      Math.abs(previous.y - offset.y) > 0.5
    ) {
      material.screenOffset = offset;
      label.getStyle().screenOffset = offset;
      changed = true;
    }
  });
  return changed;
}
