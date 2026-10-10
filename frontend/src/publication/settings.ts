export interface FigureSettings {
  widthMm: 89 | 183;
  dpi: 300 | 600;
  fontPt: 7 | 8 | 9;
  transparent: boolean;
  shape?: "viewport" | "square" | "landscape" | "portrait";
}
export const defaultFigure: FigureSettings = {
  widthMm: 89,
  dpi: 600,
  fontPt: 7,
  transparent: false,
};
export function validFigure(value: unknown): value is FigureSettings {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    [89, 183].includes(Number(p.widthMm)) &&
    [300, 600].includes(Number(p.dpi)) &&
    [7, 8, 9].includes(Number(p.fontPt)) &&
    typeof p.transparent === "boolean" &&
    typeof p.widthMm === "number" &&
    typeof p.dpi === "number" &&
    typeof p.fontPt === "number" &&
    (p.shape === undefined ||
      (typeof p.shape === "string" &&
        ["viewport", "square", "landscape", "portrait"].includes(p.shape)))
  );
}
/** Native molecular panels can use a print layout independent of screen width. */
export function figureAspect(settings: FigureSettings, viewportAspect: number) {
  if (
    !validFigure(settings) ||
    !Number.isFinite(viewportAspect) ||
    viewportAspect <= 0
  )
    throw new Error("The native viewport is not ready.");
  switch (settings.shape) {
    case "square":
      return 1;
    case "landscape":
      return 3 / 2;
    case "portrait":
      return 3 / 4;
    default:
      return viewportAspect;
  }
}
export function figureDimensions(settings: FigureSettings, aspect: number) {
  if (
    !validFigure(settings) ||
    !Number.isFinite(aspect) ||
    aspect < 0.2 ||
    aspect > 5
  )
    throw new Error("Unsupported figure dimensions.");
  const width = Math.round((settings.widthMm / 25.4) * settings.dpi),
    height = Math.round(width / aspect);
  if (width > 8192 || height > 8192 || width * height > 24 * 1024 ** 2)
    throw new Error(
      "Figure exceeds its render budget. Choose 300 dpi or a wider view.",
    );
  return {
    width,
    height,
    widthPt: (settings.widthMm / 25.4) * 72,
    heightMm: settings.widthMm / aspect,
  };
}
