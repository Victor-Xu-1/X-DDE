import type * as Plotly from "plotly.js";
import { dataUrlBlob } from "./png-resolution";
import type { FigureSettings } from "./settings";
import { printSvg } from "./svg";

/** A separate native export pass protects live plot zoom, selections and data. */
export async function plotlyFigure(
  library: typeof Plotly,
  source: Plotly.PlotlyHTMLElement,
  settings: FigureSettings,
): Promise<Blob> {
  const pass = document.createElement("div");
  pass.style.cssText = "position:fixed;left:-10000px;top:0;pointer-events:none";
  pass.setAttribute("aria-hidden", "true");
  document.body.append(pass);
  const copy = JSON.parse(
    JSON.stringify({ data: source.data, layout: source.layout }),
  ) as { data: Plotly.Data[]; layout: Partial<Plotly.Layout> };
  const width = Math.round((settings.widthMm / 25.4) * 72);
  const matrix = copy.data.some((trace) => trace.type === "heatmap");
  const count = Math.max(
    0,
    ...copy.data.map((trace) =>
      Array.isArray((trace as Plotly.PlotData).y)
        ? (trace as Plotly.PlotData).y.length
        : 0,
    ),
  );
  const categorical = copy.data.some(
    (trace) =>
      Array.isArray((trace as Plotly.PlotData).y) &&
      (trace as Plotly.PlotData).y.some((y) => typeof y === "string"),
  );
  const height = matrix
    ? width
    : categorical
      ? Math.max(Math.round(width * 0.65), count * 13 + 50)
      : Math.round(width * 0.65);
  const ratio = width / Math.max(1, source.getBoundingClientRect().width);
  if (matrix && count > 12) {
    const interval = width < 300 ? 5 : 2;
    copy.layout.xaxis = { ...copy.layout.xaxis, dtick: interval };
    copy.layout.yaxis = { ...copy.layout.yaxis, dtick: interval };
  }
  try {
    await library.newPlot(
      pass,
      copy.data,
      {
        ...copy.layout,
        width,
        height,
        autosize: false,
        font: {
          family: "Arial, Helvetica, sans-serif",
          size: settings.fontPt,
          color: "#172b44",
        },
        paper_bgcolor: settings.transparent ? "rgba(0,0,0,0)" : "white",
        plot_bgcolor: settings.transparent ? "rgba(0,0,0,0)" : "white",
        margin: {
          l: Math.max(34, (copy.layout.margin?.l ?? 58) * ratio),
          r: Math.max(18, (copy.layout.margin?.r ?? 18) * ratio),
          t: 8,
          b: 40,
        },
        legend: {
          orientation: "h",
          y: -0.35,
          x: 0,
          font: { size: settings.fontPt },
        },
      },
      { staticPlot: true, displayModeBar: false },
    );
    const url = await library.toImage(pass, { format: "svg", width, height });
    const native = await dataUrlBlob(url);
    const svg = new DOMParser().parseFromString(
      await native.text(),
      "image/svg+xml",
    ).documentElement;
    return printSvg(svg as unknown as SVGSVGElement, settings);
  } finally {
    library.purge(pass);
    pass.remove();
  }
}
