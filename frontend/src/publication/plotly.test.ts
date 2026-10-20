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

async function sizedFigure(data: unknown[], layout = {}) {
  const newPlot = vi.fn().mockResolvedValue(undefined);
  const library = {
    newPlot,
    purge: vi.fn(),
    toImage: vi
      .fn()
      .mockImplementation((_target, { width, height }) =>
        Promise.resolve(
          "data:image/svg+xml," +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="1" y="9">Native</text></svg>`,
            ),
        ),
      ),
  } as unknown as typeof Plotly;
  const source = Object.assign(document.createElement("div"), {
    data,
    layout,
  }) as unknown as Plotly.PlotlyHTMLElement;
  const original = JSON.stringify({ data: source.data, layout: source.layout });
  const figure = await plotlyFigure(library, source, defaultFigure);
  expect(JSON.stringify({ data: source.data, layout: source.layout })).toBe(
    original,
  );
  expect(library.purge).toHaveBeenCalledTimes(1);
  return {
    layout: newPlot.mock.calls[0][2],
    data: newPlot.mock.calls[0][1],
    svg: await figure.text(),
  };
}

it("sizes categorical uncertainty figures by distinct rows, not repeated interval endpoints or separators", async () => {
  const names = Array.from(
    { length: 20 },
    (_, i) => `B${String(i + 1).padStart(3, "0")}`,
  );
  const result = await sizedFigure(
    [
      {
        type: "scatter",
        mode: "lines",
        x: names.flatMap(() => [1, 2, null]),
        y: names.flatMap((name) => [name, name, null]),
      },
      { type: "scatter", mode: "markers", x: names.map(() => 1.5), y: names },
    ],
    { yaxis: { type: "category" } },
  );
  expect(result.layout.height).toBe(310);
  expect(result.svg).toContain('height="109.48412698412699mm"');
  expect(result.data[0].y).toHaveLength(60);
  expect(result.data[1].y).toEqual(names);
});

it("keeps numeric category zero and overlay rows while excluding separators", async () => {
  const result = await sizedFigure(
    [
      { type: "scatter", x: [1, 2, 3, 4, 5], y: [0, 0, null, 1, 1] },
      { type: "bar", x: [2, 3], y: [0, 1] },
    ],
    { yaxis: { type: "category" } },
  );
  expect(result.layout.height).toBe(164);
  expect(result.data[0].y[0]).toBe(0);
});

it("keeps dense heatmaps square and continuous trajectories independent of sample count", async () => {
  const matrix = await sizedFigure([
    {
      type: "heatmap",
      y: Array.from({ length: 96 }, (_, i) => `B${i}`),
      x: ["C"],
      z: Array.from({ length: 96 }, () => [0]),
    },
  ]);
  expect(matrix.layout.height).toBe(matrix.layout.width);
  expect(matrix.layout.yaxis.dtick).toBe(5);
  const trajectory = await sizedFigure([
    {
      type: "scatter",
      y: Array.from({ length: 2000 }, (_, i) => i / 100),
      x: Array.from({ length: 2000 }, (_, i) => i),
    },
  ]);
  expect(trajectory.layout.height).toBe(164);
});
