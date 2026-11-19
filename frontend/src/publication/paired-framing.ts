import { structureScales } from "./settings";

/** Furthest foreground point from the current camera center, in panel fractions. */
export function foregroundRadius(image: ImageBitmap) {
  const sample = document.createElement("canvas");
  const ratio = Math.min(1, 256 / Math.max(image.width, image.height));
  const width = (sample.width = Math.max(1, Math.round(image.width * ratio)));
  const height = (sample.height = Math.max(
    1,
    Math.round(image.height * ratio),
  ));
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The native image could not be measured.");
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  let radius = 0;
  let occupied = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 24) continue;
      occupied = true;
      radius = Math.max(
        radius,
        Math.abs((x + 0.5) / width - 0.5),
        Math.abs((y + 0.5) / height - 0.5),
      );
    }
  }
  return occupied ? radius : null;
}

/** A common magnification keeps A and B on the same relative scale. */
export function pairedMagnification(radius: number) {
  return (
    [...structureScales]
      .reverse()
      .find((scale) => (radius + 0.012) * scale <= 0.42) ?? 1
  );
}

/** Inspect the guard bands at native resolution so thin edges cannot vanish during sampling. */
export function hasClearNativeMargin(image: ImageBitmap) {
  const { width, height } = image;
  const horizontal = Math.max(1, Math.ceil(width * 0.04));
  const vertical = Math.max(1, Math.ceil(height * 0.04));
  const middle = height - 2 * vertical;
  const sample = document.createElement("canvas");
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The native image edge could not be measured.");
  return [
    [0, 0, width, vertical],
    [0, height - vertical, width, vertical],
    [0, vertical, horizontal, middle],
    [width - horizontal, vertical, horizontal, middle],
  ].every(([x, y, w, h]) => {
    sample.width = w;
    sample.height = h;
    context.drawImage(image, x, y, w, h, 0, 0, w, h);
    const { data } = context.getImageData(0, 0, w, h);
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 0) return false;
    }
    return true;
  });
}
