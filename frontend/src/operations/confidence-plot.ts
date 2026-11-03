import type { Layout, Shape } from "plotly.js";
import type { ConfidenceInspection } from "../viewer/confidence-types";

/** Native token coordinates stay native; labels and chain borders are exact mapped annotations. */
export function confidencePlotLayout(
  inspection: ConfidenceInspection | null | undefined,
  selected: string[],
  borders: boolean,
): Partial<Layout> {
  if (!inspection) return {};
  const shapes: Partial<Shape>[] = [];
  for (const [i, token] of inspection.tokens.entries()) {
    if (borders && i && token.chain !== inspection.tokens[i - 1].chain)
      for (const axis of ["x", "y"] as const)
        shapes.push(
          axis === "x"
            ? {
                type: "line",
                x0: i - 0.5,
                x1: i - 0.5,
                y0: 0,
                y1: 1,
                yref: "paper",
                line: { color: "#fff", width: 1.5 },
              }
            : {
                type: "line",
                y0: i - 0.5,
                y1: i - 0.5,
                x0: 0,
                x1: 1,
                xref: "paper",
                line: { color: "#fff", width: 1.5 },
              },
        );
    if (selected.includes(token.residue)) {
      shapes.push({
        type: "rect",
        x0: i - 0.5,
        x1: i + 0.5,
        y0: 0,
        y1: 1,
        yref: "paper",
        fillcolor: "rgba(255,140,40,.22)",
        line: { width: 0 },
      });
      shapes.push({
        type: "rect",
        y0: i - 0.5,
        y1: i + 0.5,
        x0: 0,
        x1: 1,
        xref: "paper",
        fillcolor: "rgba(78,174,226,.20)",
        line: { width: 0 },
      });
    }
  }
  return { shapes };
}
