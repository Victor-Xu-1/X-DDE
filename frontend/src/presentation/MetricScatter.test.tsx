import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MetricScatter } from "./MetricScatter";
const chart = vi.hoisted(() => vi.fn());
vi.mock("./plots/InteractivePlot", () => ({
  InteractivePlot: (props: {
    title: string;
    onPoint?(point: { pointIndex: number; curveNumber: number }): void;
  }) => {
    chart(props);
    return (
      <section role="application" aria-label={props.title}>
        <button
          onClick={() => props.onPoint?.({ pointIndex: 1, curveNumber: 0 })}
        >
          Native second point
        </button>
        <button
          onClick={() => props.onPoint?.({ pointIndex: 0, curveNumber: 1 })}
        >
          Reference line
        </button>
      </section>
    );
  },
}));
afterEach(() => {
  cleanup();
  chart.mockClear();
});
const rows = [
  { id: "source-8", length: 220, score: -0.6953 },
  { id: "missing", length: 200, score: null },
  { id: "source-3", length: 214, score: -1.1675 },
];
const metrics = [
  {
    key: "length",
    label: "Length (aa)",
    value: (row: (typeof rows)[number]) => row.length,
  },
  {
    key: "score",
    label: "Model score",
    value: (row: (typeof rows)[number]) => row.score,
  },
];
it("retains raw negative values and original row selection through filtered native points and keyboard controls", async () => {
  const onSelect = vi.fn();
  render(
    <MetricScatter
      rows={rows}
      metrics={metrics}
      language="en"
      label="Scores"
      rowId={(row) => row.id}
      rowLabel={(row) => row.id}
      selected="source-8"
      onSelect={onSelect}
    />,
  );
  const plot = chart.mock.lastCall![0];
  expect(plot.height).toBe(290);
  expect(plot.data[0].x).toEqual([220, 214]);
  expect(plot.data[0].y).toEqual([-0.6953, -1.1675]);
  expect(plot.data[0].marker.size).toEqual([8, 5]);
  expect(screen.getByText(/2 \/ 3 records/)).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Native second point" }),
  );
  expect(onSelect).toHaveBeenLastCalledWith(rows[2]);
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Inspect record" }),
    "2",
  );
  expect(onSelect).toHaveBeenLastCalledWith(rows[2]);
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "X axis" }),
    "score",
  );
  expect(chart.mock.lastCall![0].data[0].x).toEqual([-0.6953, -1.1675]);
});
it("keeps identity axes equal and never selects a reference line as a source record", async () => {
  const onSelect = vi.fn();
  render(
    <MetricScatter
      rows={rows}
      metrics={metrics}
      language="en"
      label="Validation"
      rowId={(row) => row.id}
      rowLabel={(row) => row.id}
      onSelect={onSelect}
      identity
    />,
  );
  const plot = chart.mock.lastCall![0];
  expect(plot.layout.xaxis.range).toEqual(plot.layout.yaxis.range);
  expect(plot.layout.yaxis.scaleanchor).toBe("x");
  expect(plot.data[1].x).toEqual(plot.data[1].y);
  await userEvent.click(screen.getByRole("button", { name: "Reference line" }));
  expect(onSelect).not.toHaveBeenCalled();
});
it("does not fill absent coordinate pairs with zero or mount a misleading plot", () => {
  render(
    <MetricScatter
      rows={rows.map((row) => ({ ...row, score: null }))}
      metrics={metrics}
      language="en"
      label="Absent scores"
      rowId={(row) => row.id}
      rowLabel={(row) => row.id}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "No complete value pairs",
  );
  expect(screen.queryByRole("application")).toBeNull();
});
