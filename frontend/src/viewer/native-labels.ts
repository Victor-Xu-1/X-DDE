import type { GLViewer, Label, XYZ } from "3dmol";
import {
  layoutNativeLabels,
  type NativeAnnotation,
} from "./native-label-layout";

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
    const restore = () => {
      const failures: unknown[] = [];
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
      if (failures.length)
        throw new AggregateError(failures, "Native label restoration failed.");
    };
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
