import { expect, it, vi } from "vitest";
import type * as Plotly from "plotly.js";
import { plotlyFigure } from "./plotly";
import { defaultFigure } from "./settings";

it("normalizes horizontal and vertical uncertainty bars without rewriting source values or styling", async () => {
  const newPlot = vi.fn().mockResolvedValue(undefined);
  const library = {
    newPlot,
    purge: vi.fn(),
    toImage: vi
      .fn()
      .mockResolvedValue(
        "data:image/svg+xml," +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="252" height="164"><path d="M10 20L60 20"/><text x="10" y="40">ΔΔG</text></svg>',
          ),
      ),
  } as unknown as typeof Plotly;
  const source = Object.assign(document.createElement("div"), {
    data: [
      {
        type: "scatter",
        x: [-1.8],
        y: [1],
        error_x: { type: "data", array: [0.35], thickness: 1.8, width: 5 },
        error_y: { type: "data", array: [0.2], thickness: 2, width: 4 },
      },
    ],
    layout: {},
  }) as unknown as Plotly.PlotlyHTMLElement;
  const original = JSON.stringify(source.data);
  const figure = await plotlyFigure(library, source, defaultFigure);
  const trace = newPlot.mock.calls[0][1][0];
  expect(trace.error_x).toEqual({
    type: "data",
    array: [0.35],
    thickness: 0.7,
    width: 2.5,
  });
  expect(trace.error_y).toEqual({
    type: "data",
    array: [0.2],
    thickness: 0.7,
    width: 2.5,
  });
  expect(JSON.stringify(source.data)).toBe(original);
  expect(await figure.text()).toContain('width="89mm"');
  expect(library.purge).toHaveBeenCalled();
});
