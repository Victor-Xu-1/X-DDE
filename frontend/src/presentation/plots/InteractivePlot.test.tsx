import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InteractivePlot } from "./InteractivePlot";
import type { ChartTrace } from "./types";
import userEvent from "@testing-library/user-event";

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
  relayout: vi.fn(async () => {}),
  Plots: { resize: vi.fn() },
}));
vi.mock("plotly.js-cartesian-dist-min", () => ({ default: native }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  native.react.mockClear();
  native.relayout.mockClear();
});

it.each([undefined, [-8.4, -5.8]])(
  "restores the configured scientific axis bounds on Reset (%s)",
  async (range) => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const layout = {
      xaxis: { title: { text: "Observed" }, ...(range ? { range } : {}) },
      yaxis: { title: { text: "Predicted" }, ...(range ? { range } : {}) },
    };
    render(
      <InteractivePlot
        title="Validation"
        data={[{ type: "scatter", x: [-8, -6], y: [-7, -6] }]}
        layout={layout}
        language="en"
      />,
    );
    const reset = screen.getByRole("button", { name: "Reset" });
    await waitFor(() => expect(reset).toBeEnabled());
    await userEvent.click(reset);
    expect(native.relayout).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      range
        ? {
            "xaxis.autorange": false,
            "xaxis.range": range,
            "yaxis.autorange": false,
            "yaxis.range": range,
          }
        : { "xaxis.autorange": true, "yaxis.autorange": true },
    );
  },
);

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
