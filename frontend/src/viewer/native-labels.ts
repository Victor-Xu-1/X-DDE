import type { GLViewer, Label } from "3dmol";

/** One owner for all native annotations and their temporary print typography. */
export class NativeLabelLayer {
  private entries = new Set<Label>();
  constructor(private viewer: GLViewer) {}
  add(...specification: Parameters<GLViewer["addLabel"]>) {
    const label = this.viewer.addLabel(...specification);
    this.entries.add(label);
    return label;
  }
  clear() {
    this.entries.clear();
    this.viewer.removeAllLabels();
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
    const previous = [...this.entries].map((label) => ({
      label,
      style: { ...label.getStyle() },
      scale: label.sprite.scale.clone(),
      visible: label.sprite.visible,
    }));
    const restore = () => {
      const failures: unknown[] = [];
      for (const { label, style, scale, visible } of previous) {
        try {
          this.viewer.setLabelStyle(label, style);
        } catch (error) {
          failures.push(error);
        } finally {
          label.sprite.scale.copy(scale);
          label.sprite.visible = visible;
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
