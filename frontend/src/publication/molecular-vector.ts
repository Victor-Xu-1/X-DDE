import type { Ketcher } from "../editors/scientificEditor";
import { validFigure, type FigureSettings } from "./settings";
import { printSvg } from "./svg";

type NativeOptions = Parameters<NonNullable<Ketcher["generateImage"]>>[1];
export type MolecularPrint = Pick<
  FigureSettings,
  "widthMm" | "fontPt" | "transparent"
>;
export function molecularImageOptions(
  weight: number,
  print?: MolecularPrint,
): NativeOptions {
  if (![1.2, 1.6, 2.2].includes(weight))
    throw new Error("Choose a supported drawing style.");
  return {
    outputFormat: "svg",
    backgroundColor: print?.transparent ? "" : "1,1,1",
    "render-bond-thickness": print ? weight * 0.375 : weight,
    "render-bond-thickness-unit": print ? "pt" : "px",
    ...(print
      ? {
          "render-font-size": print.fontPt,
          "render-font-size-unit": "pt" as const,
          "render-font-size-sub": (print.fontPt * 2) / 3,
          "render-font-size-sub-unit": "pt" as const,
          "bond-length": 14.4,
          "bond-length-unit": "pt" as const,
          "image-resolution": 72,
        }
      : {}),
  };
}

/** Native point-sized paths are padded to paper width, never shrunk or cropped. */
export async function molecularVector(
  native: Blob,
  settings: FigureSettings,
): Promise<Blob> {
  if (
    !validFigure(settings) ||
    native.type !== "image/svg+xml" ||
    native.size > 2 * 1024 ** 2
  )
    throw new Error("Invalid native molecular figure.");
  const source = new DOMParser().parseFromString(
    await native.text(),
    "image/svg+xml",
  ).documentElement as unknown as SVGSVGElement;
  const box = source.getAttribute("viewBox")?.split(/[ ,]+/).map(Number);
  if (
    !box ||
    box.length !== 4 ||
    !box.every(Number.isFinite) ||
    !(box[2] > 0 && box[3] > 0)
  )
    throw new Error("Native molecular drawing needs explicit dimensions.");
  const paperWidth = (settings.widthMm / 25.4) * 72;
  if (box[2] > paperWidth + 1) {
    const error = new Error(
      "Choose double column or a smaller printed type size for this structure.",
    );
    error.name = "MolecularLayoutError";
    throw error;
  }
  // Wrapping the original native nodes keeps glyphs, stereobonds and chemical colors intact.
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute(
    "transform",
    `translate(${(paperWidth - box[2]) / 2 - box[0]} ${-box[1]})`,
  );
  while (source.firstChild) group.append(source.firstChild);
  source.append(group);
  source.setAttribute("viewBox", `0 0 ${paperWidth} ${box[3]}`);
  return printSvg(source, settings);
}
