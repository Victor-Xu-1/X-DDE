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
