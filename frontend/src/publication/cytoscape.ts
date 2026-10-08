import type { Core } from "cytoscape";
import { figureDimensions, type FigureSettings } from "./settings";
import { dataUrlBlob } from "./png-resolution";

/** Export the currently viewed native network, retaining graph positions and scientific edge styles. */
export async function networkFigure(
  graph: Core,
  element: HTMLElement,
  settings: FigureSettings,
) {
  const bounds = element.getBoundingClientRect();
  const size = figureDimensions(settings, bounds.width / bounds.height);
  const scale = size.width / bounds.width;
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
        maxWidth: size.width,
        maxHeight: size.height,
        bg: settings.transparent ? undefined : "#ffffff",
      }),
    );
  } finally {
    graph.style().fromJson(style).update();
  }
}
