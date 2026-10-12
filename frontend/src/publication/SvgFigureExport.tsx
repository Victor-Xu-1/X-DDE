import type { Language } from "../types";
import { displayedSvg } from "../presentation/visual-export";
import { FigureExport } from "./FigureExport";
import { printSvg } from "./svg";

export function SvgFigureExport({
  source,
  sourceKey,
  filename,
  language,
}: {
  source(): SVGSVGElement | null;
  sourceKey: string;
  filename: string;
  language: Language;
}) {
  return (
    <FigureExport
      sourceKey={sourceKey}
      language={language}
      filename={filename}
      format="svg"
      render={async (settings) => {
        const current = source();
        if (!current) throw new Error("Select a figure first.");
        const document = new DOMParser().parseFromString(
          await displayedSvg(current).text(),
          "image/svg+xml",
        );
        return printSvg(
          document.documentElement as unknown as SVGSVGElement,
          settings,
        );
      }}
    />
  );
}
