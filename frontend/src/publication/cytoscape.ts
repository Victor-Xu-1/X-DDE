import type { Core } from "cytoscape";
import { figureDimensions, type FigureSettings } from "./settings";
import { dataUrlBlob } from "./png-resolution";

/** Export the currently viewed native network, retaining graph positions and scientific edge styles. */
export async function networkFigure(
  graph: Core,
  element: HTMLElement,
  settings: FigureSettings,
) {
  if (!element.isConnected) throw new Error("The network view closed.");
  const width = graph.width(),
    height = graph.height();
  const size = figureDimensions(settings, width / height);
  const scale = size.width / width;
  const style = graph.json().style;
  try {
    graph
      .style()
      .append({
        selector: "node, edge",
        style: {
          "font-family": "Arial, Helvetica, sans-serif",
          "font-size":
            (settings.fontPt * settings.dpi) / 72 / scale / graph.zoom(),
        },
      })
      .update();
    return await dataUrlBlob(
      graph.png({
        full: false,
        // A specified dimension suppresses DPR multiplication. The subpixel epsilon
        // compensates canvas integer truncation without resampling the native pixels.
        scale: (size.width + 0.01) / width,
        maxWidth: size.width,
        bg: settings.transparent ? undefined : "#ffffff",
      }),
    );
  } finally {
    graph.style().fromJson(style).update();
  }
}
