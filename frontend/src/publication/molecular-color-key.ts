import { nativeFigurePixels, type FigurePanel } from "./figure-panels";
import { electricColorStops } from "../viewer/electric-color-scale";
import {
  figureAspect,
  figureDimensions,
  type FigureSettings,
} from "./settings";

export type ColorMark = { color: string; label: string };
export type MolecularColorKey = { title: string; missing?: ColorMark } & (
  | { kind: "bands"; marks: readonly ColorMark[] }
  | { kind: "scale"; ticks: readonly [string, string, string] }
);

const fontFamily = 'Arial, "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const ink = "#15253e";
const line = "#aeb8c5";

/** Reserve the color key inside the physical print size and render the model at its final pixels. */
export async function figureWithColorKeys(
  settings: FigureSettings,
  viewportAspect: number,
  keys: readonly MolecularColorKey[],
  capture: FigurePanel["capture"],
): Promise<Blob> {
  const { width, height } = figureDimensions(
    settings,
    figureAspect(settings, viewportAspect),
  );
  const font = (settings.fontPt * settings.dpi) / 72;
  const padding = font * 0.75;
  const lineHeight = font * 1.35;
  const rampHeight = font * 0.4;
  const footer = Math.ceil(
    padding * 2 +
      keys.reduce((total, key) => {
        const rows =
          1 +
          Number(key.kind === "scale" || key.marks.length > 0) +
          Number(Boolean(key.missing));
        return (
          total + rows * lineHeight + (key.kind === "scale" ? rampHeight : 0)
        );
      }, 0) +
      (keys.length - 1) * padding,
  );
  if (height - footer < 128) {
    const error = new Error(
      "The selected aspect leaves too little room for the molecular panel.",
    );
    error.name = "MolecularColorKeyLayoutError";
    throw error;
  }
  const panel = nativeFigurePixels({ width, height: height - footer });
  const native = await capture(settings, panel);
  if (
    native.type !== "image/png" ||
    !native.size ||
    native.size > 64 * 1024 ** 2
  )
    throw new Error("Expected a bounded native molecular PNG.");
  const image = await createImageBitmap(native);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    if (image.width !== panel.width || image.height !== panel.height)
      throw new Error("The native panel returned different image dimensions.");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The figure canvas is unavailable.");
    if (!settings.transparent) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0);
    context.textBaseline = "top";
    context.fillStyle = line;
    context.fillRect(
      padding,
      panel.height,
      width - 2 * padding,
      Math.max(1, font / 22),
    );
    let y = panel.height + padding;
    for (const key of keys) {
      context.fillStyle = ink;
      context.font = `600 ${font}px ${fontFamily}`;
      context.fillText(key.title, padding, y);
      y += lineHeight;
      context.font = `${font}px ${fontFamily}`;
      if (key.kind === "scale") {
        const [low, middle, high] = key.ticks;
        const first = padding + context.measureText(low).width / 2;
        const last = width - padding - context.measureText(high).width / 2;
        const center = (first + last) / 2;
        const ramp = context.createLinearGradient(first, 0, last, 0);
        for (const { offset, color } of electricColorStops)
          ramp.addColorStop(offset, color);
        context.fillStyle = ramp;
        context.fillRect(first, y, last - first, rampHeight);
        context.strokeStyle = line;
        context.lineWidth = Math.max(1, font / 24);
        context.strokeRect(first, y, last - first, rampHeight);
        y += rampHeight;
        context.fillStyle = ink;
        context.textAlign = "center";
        context.fillText(low, first, y);
        context.fillText(middle, center, y);
        context.fillText(high, last, y);
        context.textAlign = "left";
        y += lineHeight;
      } else if (key.marks.length) {
        key.marks.forEach((mark, index) => {
          const column = (width - 2 * padding) / key.marks.length;
          drawMark(context, mark, padding + index * column, y, font);
        });
        y += lineHeight;
      }
      if (key.missing) {
        drawMark(context, key.missing, padding, y, font);
        y += lineHeight;
      }
      y += padding;
    }
  } finally {
    image.close();
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Unable to encode the native figure.")),
      "image/png",
    ),
  );
}

function drawMark(
  context: CanvasRenderingContext2D,
  mark: ColorMark,
  x: number,
  y: number,
  font: number,
) {
  context.fillStyle = mark.color;
  context.fillRect(x, y + font * 0.18, font * 0.7, font * 0.7);
  context.fillStyle = ink;
  context.fillText(mark.label, x + font, y);
}
