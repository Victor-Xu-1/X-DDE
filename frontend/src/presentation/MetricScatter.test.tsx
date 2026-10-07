import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MetricScatter } from "./MetricScatter";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("keeps chart height, marker size and original record selection stable while resizing", async () => {
  let width = 920,
    resize!: () => void;
  const disconnected = vi.fn(),
    selected = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, 0, width, 265),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {
        disconnected();
      }
    },
  );
  const rows = [
    { id: "reference", length: 220, score: -0.6953 },
    { id: "comparison", length: 214, score: -1.1675 },
  ];
  const { container, unmount } = render(
    <MetricScatter
      rows={rows}
      language="en"
      label="Sequence scores"
      rowId={(row) => row.id}
      rowLabel={(row) => row.id}
      selected="reference"
      onSelect={selected}
      metrics={[
        { key: "length", label: "Length (aa)", value: (row) => row.length },
        { key: "score", label: "Model score", value: (row) => row.score },
      ]}
    />,
  );
  const svg = screen.getByRole("group", { name: "Length (aa) × Model score" });
  expect(svg).toHaveAttribute("viewBox", "0 0 920 265");
  expect(container.querySelectorAll(".scatter-grid")).toHaveLength(5);
  act(() => {
    width = 310;
    resize();
  });
  expect(svg).toHaveAttribute("viewBox", "0 0 310 265");
  expect(svg).toHaveAttribute("height", "265");
  expect(container.querySelectorAll(".scatter-grid")).toHaveLength(3);
  expect(container.querySelector(".scatter-point.selected")).toHaveAttribute(
    "r",
    "6",
  );
  await userEvent.setup().click(
    screen.getByRole("button", {
      name: "comparison: Length (aa) 214; Model score -1.1675",
    }),
  );
  expect(selected).toHaveBeenCalledExactlyOnceWith(rows[1]);
  unmount();
  expect(disconnected).toHaveBeenCalledOnce();
});
it("plots only complete raw pairs and selects the exact original record", async () => {
  const rows = [
      { id: "source-8", mw: 400, score: -8.25 },
      { id: "source-3", mw: 500, score: -6.5 },
      { id: "source-1", mw: 600, score: null },
    ],
    onSelect = vi.fn();
  render(
    <MetricScatter
      rows={rows}
      label="Native scores"
      language="en"
      rowId={(row) => row.id}
      rowLabel={(row) => row.id}
      onSelect={onSelect}
      metrics={[
        { key: "mw", label: "MW (g/mol)", value: (row) => row.mw },
        { key: "score", label: "Score (kcal/mol)", value: (row) => row.score },
      ]}
    />,
  );
  const points = within(
    screen.getByRole("group", { name: "MW (g/mol) × Score (kcal/mol)" }),
  ).getAllByRole("button");
  expect(points).toHaveLength(2);
  await userEvent.setup().click(
    screen.getByRole("button", {
      name: "source-8: MW (g/mol) 400; Score (kcal/mol) -8.25",
    }),
  );
  expect(onSelect).toHaveBeenLastCalledWith(rows[0]);
});
