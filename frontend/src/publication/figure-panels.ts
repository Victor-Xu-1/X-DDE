import type { FigureSettings } from "./settings";

export type FigurePixels = { width: number; height: number };
export type FigurePanel = {
  capture(settings: FigureSettings, pixels: FigurePixels): Promise<Blob>;
};

export function nativeFigurePixels(value: unknown): FigurePixels {
  if (value && typeof value === "object") {
    const { width, height } = value as FigurePixels;
    if (
      Number.isInteger(width) &&
      Number.isInteger(height) &&
      width >= 128 &&
      height >= 128 &&
      width <= 8192 &&
      height <= 8192 &&
      width * height <= 24 * 1024 ** 2
    )
      return { width, height };
  }
  throw new Error("Unsupported native panel dimensions.");
}
