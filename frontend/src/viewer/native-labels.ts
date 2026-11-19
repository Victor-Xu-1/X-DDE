import type { GLViewer, Label, LabelSpec, XYZ } from "3dmol";
import type { GeometryOccupancy, LabelPlacement } from "./contact-label-layout";
import {
  layoutNativeLabels,
  type NativeAnnotation,
} from "./native-label-layout";

/** A readable annotation plane, independent of the depth of its source atom. */
export const nativeAnnotationStyle: LabelSpec = {
  backgroundColor: "white",
  backgroundOpacity: 0.92,
  showBackground: true,
  borderThickness: 0,
  inFront: true,
  alignment: "topLeft",
};

/** One owner for all native annotations and their temporary print typography. */
export class NativeLabelLayer {
  private entries = new Map<Label, NativeAnnotation>();
  private ligand: XYZ[] = [];
  private updating = false;
  constructor(private viewer: GLViewer) {}
  add(...specification: Parameters<GLViewer["addLabel"]>) {
    const label = this.viewer.addLabel(...specification);
    this.entries.set(label, { label, layoutHidden: false });
    return label;
  }
  clear() {
    this.entries.clear();
    this.ligand = [];
    this.viewer.removeAllLabels();
  }
  protectLigand(points: XYZ[]) {
    this.ligand = points;
  }
  layout() {
    if (this.updating || !this.entries.size) return;
    this.updating = true;
    try {
      if (
        layoutNativeLabels(this.viewer, [...this.entries.values()], this.ligand)
      )
        this.viewer.render();
    } finally {
      this.updating = false;
    }
  }
  arrangeForPrint(readGeometry: () => GeometryOccupancy) {
    const entries = [...this.entries.values()];
    if (
      !entries.some(
        ({ label, layoutHidden }) => label.sprite.visible || layoutHidden,
      )
    )
      return [];
    const visibility = entries.map(({ label }) => label.sprite.visible);
    let occupied: GeometryOccupancy;
    try {
      for (const { label } of entries) label.sprite.visible = false;
      occupied = readGeometry();
    } finally {
      entries.forEach(({ label }, index) => {
        label.sprite.visible = visibility[index];
      });
    }
    const placements: LabelPlacement[] = [];
    layoutNativeLabels(this.viewer, entries, this.ligand, { occupied, placements });
    return placements;
  }
  printFont(outputPixels: number, pixelRatio: number) {
    if (
      !Number.isFinite(outputPixels) ||
      outputPixels <= 0 ||
      !Number.isFinite(pixelRatio) ||
      pixelRatio <= 0
    )
      throw new Error("Invalid printed label size.");
    // Use full-resolution glyphs, compensating for the native antialiasing/DPR
    // in sprite scale rather than enlarging smaller text textures.
    const textureSize = Math.ceil(outputPixels),
      calibration = outputPixels / (textureSize * pixelRatio);
    const previous = [...this.entries.values()].map((entry) => ({
      entry,
      layoutHidden: entry.layoutHidden,
      label: entry.label,
      style: { ...entry.label.getStyle() },
      scale: entry.label.sprite.scale.clone(),
      visible: entry.label.sprite.visible,
    }));
    const wasUpdating = this.updating;
    const restore = () => {
      const failures: unknown[] = [];
      this.updating = true;
      try {
        for (const {
          label,
          style,
          scale,
          visible,
          entry,
          layoutHidden,
        } of previous) {
          try {
            this.viewer.setLabelStyle(label, style);
          } catch (error) {
            failures.push(error);
          } finally {
            label.sprite.scale.copy(scale);
            label.sprite.visible = visible;
            entry.layoutHidden = layoutHidden;
          }
        }
      } finally {
        this.updating = wasUpdating;
      }
      if (failures.length)
        throw new AggregateError(failures, "Native label restoration failed.");
    };
    this.updating = true;
    try {
      for (const { label, style } of previous)
        this.viewer.setLabelStyle(label, {
          ...style,
          font: "Arial",
          fontSize: textureSize,
        });
      for (const { label, visible } of previous) {
        label.sprite.scale.set(calibration, calibration, 1);
        label.sprite.visible = visible;
      }
    } catch (error) {
      restore();
      throw error;
    }
    return restore;
  }
}

const layers = new WeakMap<GLViewer, NativeLabelLayer>();
export function nativeLabelLayer(viewer: GLViewer) {
  let layer = layers.get(viewer);
  if (!layer) {
    layer = new NativeLabelLayer(viewer);
    layers.set(viewer, layer);
  }
  return layer;
}
