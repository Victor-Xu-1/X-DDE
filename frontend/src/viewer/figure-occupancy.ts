import type { LabelBox } from "./contact-label-layout";

/** Count rendered geometry under a screen-space box using a small summed-area grid. */
export function figureOccupancy(canvas: HTMLCanvasElement) {
  const view = canvas.getBoundingClientRect();
  const sample = canvas.ownerDocument.createElement("canvas");
  const ratio = Math.min(1, 384 / Math.max(canvas.width, canvas.height));
  const width = Math.max(1, Math.round(canvas.width * ratio));
  const height = Math.max(1, Math.round(canvas.height * ratio));
  sample.width = width;
  sample.height = height;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context || view.width <= 0 || view.height <= 0)
    throw new Error("The printed structure could not be measured.");
  context.drawImage(canvas, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const stride = width + 1;
  const counts = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += Number(data[(y * width + x) * 4 + 3] >= 24);
      counts[(y + 1) * stride + x + 1] = counts[y * stride + x + 1] + row;
    }
  }
  const scaleX = width / view.width;
  const scaleY = height / view.height;
  const clamp = (value: number, max: number) =>
    Math.max(0, Math.min(max, value));
  return (box: LabelBox) => {
    const left = clamp(Math.floor(box.x * scaleX), width);
    const right = clamp(Math.ceil((box.x + box.width) * scaleX), width);
    const top = clamp(Math.floor(box.y * scaleY), height);
    const bottom = clamp(Math.ceil((box.y + box.height) * scaleY), height);
    return (
      counts[bottom * stride + right] -
      counts[top * stride + right] -
      counts[bottom * stride + left] +
      counts[top * stride + left]
    );
  };
}
