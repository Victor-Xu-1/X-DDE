import {
  figureAspect,
  figureDimensions,
  type FigureSettings,
} from "../publication/settings";
import type { MolecularViewHandle } from "./molecular-view-state";

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
  handles: readonly [MolecularViewHandle, MolecularViewHandle],
  labels: readonly [string, string],
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
  context.fillStyle = "#15253e";
  for (let i = 0; i < 2; i++) {
    const x = i === 0 ? 0 : widths[0] + gap;
    labelsByPanel[i].forEach((line, row) =>
      context.fillText(line, x + padding, padding + row * lineHeight),
    );
    const native = await handles[i].capture(settings, {
      width: widths[i],
      height: size.height - header,
    });
    if (native.type !== "image/png" || native.size > 64 * 1024 ** 2)
      throw new Error("Expected a bounded native molecular PNG.");
    const pixels = await createImageBitmap(native);
    try {
      if (pixels.width !== widths[i] || pixels.height !== size.height - header)
        throw new Error(
          "The native panel returned different image dimensions.",
        );
      context.drawImage(pixels, x, header);
    } finally {
      pixels.close();
    }
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
