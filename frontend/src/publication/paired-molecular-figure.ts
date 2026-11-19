import {
  figureAspect,
  figureDimensions,
  type FigureSettings,
} from "./settings";
import type { FigurePanel } from "./figure-panels";
import {
  foregroundRadius,
  hasClearNativeMargin,
  pairedMagnification,
} from "./paired-framing";

function linesFor(
  text: string,
  width: number,
  context: CanvasRenderingContext2D,
) {
  if (!text.trim() || text.length > 240)
    throw new Error("Select concise, unambiguous compound identifiers.");
  const lines: string[] = [];
  let line = "";
  for (const character of Array.from(text)) {
    if (line && context.measureText(line + character).width > width) {
      lines.push(line);
      line = "";
    }
    line += character;
  }
  if (line) lines.push(line);
  if (lines.length > 4)
    throw new Error("Compound labels need the double-column figure width.");
  return lines;
}

/** Compose two actual native renders at their final pixels; never resize molecular images. */
export async function comparisonFigure(
  settings: FigureSettings,
  handles: readonly [FigurePanel, FigurePanel],
  labels: readonly [string, string],
  autoFit = false,
): Promise<Blob> {
  const size = figureDimensions(settings, figureAspect(settings, 2));
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The figure canvas is unavailable.");
  const gap = Math.round((4 * settings.dpi) / 25.4),
    padding = Math.round((1.5 * settings.dpi) / 25.4),
    font = (settings.fontPt * settings.dpi) / 72,
    lineHeight = font * 1.35;
  const widths = [
    Math.floor((size.width - gap) / 2),
    Math.ceil((size.width - gap) / 2),
  ];
  context.font = `600 ${font}px Arial, sans-serif`;
  context.textBaseline = "top";
  const labelsByPanel = labels.map((label, i) =>
    linesFor(
      `${i === 0 ? "A" : "B"} · ${label}`,
      widths[i] - 2 * padding,
      context,
    ),
  );
  const header = Math.ceil(
    Math.max(...labelsByPanel.map((lines) => lines.length)) * lineHeight +
      2 * padding,
  );
  if (size.height - header < 128)
    throw new Error("The comparison needs a wider figure layout.");
  if (!settings.transparent) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
  }
  async function renderPanels(value: FigureSettings) {
    const images: ImageBitmap[] = [];
    try {
      for (const [index, handle] of handles.entries()) {
        const dimensions = {
          width: widths[index],
          height: size.height - header,
        };
        const native = await handle.capture(value, dimensions);
        if (native.type !== "image/png" || native.size > 64 * 1024 ** 2)
          throw new Error("Expected a bounded native molecular PNG.");
        const image = await createImageBitmap(native);
        images.push(image);
        if (
          image.width !== dimensions.width ||
          image.height !== dimensions.height
        )
          throw new Error(
            "The native panel returned different image dimensions.",
          );
      }
      return images;
    } catch (error) {
      images.forEach((image) => image.close());
      throw error;
    }
  }
  const measure = autoFit && settings.structureScale === undefined;
  const frame = measure ? { ...settings, transparent: true } : settings;
  let panels = await renderPanels(frame);
  try {
    if (measure) {
      const radius = Math.max(
        ...panels.map((image) => {
          const bounds = foregroundRadius(image);
          if (bounds === null) throw new Error("One molecular panel is empty.");
          return bounds;
        }),
      );
      const scale = pairedMagnification(radius);
      if (scale > 1) {
        const enlarged = await renderPanels({
          ...frame,
          structureScale: scale,
        });
        try {
          if (
            enlarged.every((image) => {
              const bounds = foregroundRadius(image);
              return bounds !== null && hasClearNativeMargin(image);
            })
          ) {
            panels.forEach((image) => image.close());
            panels = enlarged;
          }
        } finally {
          if (panels !== enlarged) enlarged.forEach((image) => image.close());
        }
      }
    }
    context.fillStyle = "#15253e";
    panels.forEach((image, i) => {
      const x = i === 0 ? 0 : widths[0] + gap;
      labelsByPanel[i].forEach((line, row) =>
        context.fillText(line, x + padding, padding + row * lineHeight),
      );
      context.drawImage(image, x, header);
    });
  } finally {
    panels.forEach((image) => image.close());
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("Unable to encode the native comparison.")),
      "image/png",
    ),
  );
  return blob;
}
