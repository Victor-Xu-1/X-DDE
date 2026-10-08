export interface FigureSettings {
  widthMm: 89 | 183;
  dpi: 300 | 600;
  fontPt: 7 | 8 | 9;
  transparent: boolean;
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
    typeof p.fontPt === "number"
  );
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
