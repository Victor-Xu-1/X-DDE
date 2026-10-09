import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InteractivePlot } from "./InteractivePlot";
import type { ChartTrace } from "./types";

const native = vi.hoisted(() => ({
  react: vi.fn(async (element, data, layout) => {
    // Reproduce the SDK's input normalization at its actual render boundary.
    data[0].uid = "native-scene-identity";
    data[0].x.push(9);
    layout.xaxis.title.text = "native-normalized-axis";
    element.data = data;
    element.removeAllListeners = vi.fn();
    element.on = vi.fn();
  }),
  purge: vi.fn(),
  Plots: { resize: vi.fn() },
}));
vi.mock("plotly.js-cartesian-dist-min", () => ({ default: native }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  native.react.mockClear();
});

it("keeps SDK normalization out of source values and stable render readiness", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const data: ChartTrace[] = [{ type: "scatter", x: [0.1, 0.2], y: [1, 2] }];
  const layout = { xaxis: { title: { text: "Time (ns)" } } };
  const original = JSON.stringify({ data, layout });
  render(
    <InteractivePlot
      title="Sampling"
      data={data}
      layout={layout}
      language="en"
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("application", { name: "Sampling" }),
    ).toHaveAttribute("aria-busy", "false"),
  );
  expect(native.react).toHaveBeenCalledTimes(1);
  expect(JSON.stringify({ data, layout })).toBe(original);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
});
