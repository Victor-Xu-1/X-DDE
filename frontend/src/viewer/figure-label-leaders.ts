import { labelLeaderEndpoint, type LabelPlacement } from "./contact-label-layout";

/** Add print callouts over the existing molecular rendering, outside the label boxes. */
export function figureWithLabelLeaders(
  native: HTMLCanvasElement,
  labels: readonly LabelPlacement[],
  dpi: number,
): HTMLCanvasElement {
  const figure = native.ownerDocument.createElement("canvas");
  figure.width = native.width;
  figure.height = native.height;
  const context = figure.getContext("2d");
  const { width, height } = native.getBoundingClientRect();
  if (!context || width <= 0 || height <= 0)
    throw new Error("The printed annotation layer is unavailable.");
  context.drawImage(native, 0, 0);
  const x = figure.width / width;
  const y = figure.height / height;
  context.beginPath();
  context.rect(0, 0, figure.width, figure.height);
  for (const { box } of labels)
    context.rect(box.x * x, box.y * y, box.width * x, box.height * y);
  context.clip("evenodd");
  context.beginPath();
  for (const { anchor, box } of labels) {
    const end = labelLeaderEndpoint(anchor, box);
    context.moveTo(end.x * x, end.y * y);
    context.lineTo(anchor.x * x, anchor.y * y);
  }
  context.lineWidth = (0.3 * dpi) / 72;
  context.strokeStyle = "#738192";
  context.lineCap = "round";
  context.stroke();
  return figure;
}
