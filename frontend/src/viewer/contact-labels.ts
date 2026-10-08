import {
  Vector2,
  type GLViewer,
  type Label,
  type LabelSpec,
  type XYZ,
} from "3dmol";
import { contactLabelLayout, type LabelBox } from "./contact-label-layout";

export interface ContactLabel {
  text: string;
  position: XYZ;
}
const style: LabelSpec = {
  fontSize: 11,
  fontColor: "#324c62",
  backgroundColor: "white",
  backgroundOpacity: 0.92,
  showBackground: true,
  inFront: true,
  alignment: "topLeft",
};

/** One native label layer for geometric and chemically classified contacts. */
export class ContactLabelLayer {
  private entries: { label: Label; position: XYZ }[] = [];
  private ligand: XYZ[] = [];
  private updating = false;
  constructor(private viewer: GLViewer) {}
  clear() {
    this.entries = [];
    this.ligand = [];
  }
  protectLigand(points: XYZ[]) {
    this.ligand = points;
  }
  add(rows: ContactLabel[]) {
    for (const row of rows) {
      const label = this.viewer.addLabel(
        row.text,
        { ...style, position: row.position },
        undefined,
        true,
      );
      this.entries.push({ label, position: row.position });
    }
  }
  layout() {
    if (this.updating || !this.entries.length) return;
    const canvas = this.viewer.getCanvas(),
      bounds = canvas.getBoundingClientRect();
    const project = (point: XYZ) => {
      const screen = this.viewer.modelToScreen([point])[0];
      return { x: screen.x - bounds.left, y: screen.y - bounds.top };
    };
    const positions = this.ligand
      .map(project)
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    let protectedBox: LabelBox | null = null;
    if (positions.length) {
      const x = positions.map((point) => point.x),
        y = positions.map((point) => point.y);
      protectedBox = {
        x: Math.min(...x) - 8,
        y: Math.min(...y) - 8,
        width: Math.max(...x) - Math.min(...x) + 16,
        height: Math.max(...y) - Math.min(...y) + 16,
      };
    }
    const anchors = this.entries.map(({ label, position }) => ({
      ...project(position),
      width: label.canvas.width,
      height: label.canvas.height,
    }));
    const boxes = contactLabelLayout(anchors, bounds, protectedBox);
    this.updating = true;
    let changed = false;
    try {
      this.entries.forEach(({ label }, index) => {
        const box = boxes[index];
        const visible = Boolean(box);
        if (label.sprite.visible !== visible) {
          visible ? label.show() : label.hide();
          changed = true;
        }
        if (!box) return;
        // The public native sprite material consumes these screen offsets at render time.
        // Updating the offset keeps the original source anchor and avoids recreating textures.
        const offset = new Vector2(
          box.x - anchors[index].x,
          anchors[index].y - box.y,
        );
        const material = label.sprite.material;
        if (!material) return;
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
      if (changed) this.viewer.render();
    } finally {
      this.updating = false;
    }
  }
}
const layers = new WeakMap<GLViewer, ContactLabelLayer>();
export function contactLabelLayer(viewer: GLViewer) {
  let layer = layers.get(viewer);
  if (!layer) {
    layer = new ContactLabelLayer(viewer);
    layers.set(viewer, layer);
  }
  return layer;
}
