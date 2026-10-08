import type * as Plotly from "plotly.js";

// Plotly's native heatmap accepts row/column text. The pinned DefinitelyTyped
// declarations omit this matrix form; keep the compatibility boundary explicit.
// https://plotly.com/javascript/reference/heatmap/#heatmap-text
export type MatrixTextTrace = Omit<
  Partial<Plotly.PlotData>,
  "text" | "type"
> & {
  type: "heatmap";
  text: string[][];
};
export type ChartTrace = Plotly.Data | MatrixTextTrace;
export function nativeTraces(data: ChartTrace[]): Plotly.Data[] {
  for (const trace of data) {
    if (
      trace.type !== "heatmap" ||
      !Array.isArray(trace.text) ||
      !Array.isArray(trace.text[0])
    )
      continue;
    const text = trace.text as string[][];
    const z = trace.z;
    if (
      !Array.isArray(z) ||
      z.length !== text.length ||
      text.some(
        (row, i) =>
          !Array.isArray(z[i]) ||
          row.length !== z[i].length ||
          row.some((label) => typeof label !== "string"),
      )
    )
      throw new Error("Heatmap text must match its native data cells.");
  }
  return data as Plotly.Data[];
}
