import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Bars } from "./CountBars";
import { ModelValidationPlot } from "./ModelValidationPlot";
import { SequencingQualityPlot } from "./SequencingQualityPlot";
import { SampleCorrelationPlot } from "./SampleCorrelationPlot";
const delivered = vi.hoisted(() => [] as { data: any[]; layout: any }[]);
vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: (props: any) => {
    delivered.push(props);
    return <div role="application" aria-label={props.title} />;
  },
}));
it("retains every count and complete sample name", () => {
  const rows = Array.from({ length: 32 }, (_, i) => ({
    name: "Full-sample-identifier-" + i,
    value: i,
  }));
  render(<Bars rows={rows} title="Counts" language="en" />);
  const chart = delivered.at(-1)!;
  expect(chart.data[0].y).toEqual(rows.map((row) => row.name));
  expect(chart.data[0].x).toEqual(rows.map((row) => row.value));
});
it("keeps negative model predictions within native autoscaling and labels non-independent application", () => {
  render(
    <ModelValidationPlot
      points={[{ observed: 1.5, predicted: -0.25 }]}
      metrics={{}}
      language="en"
      application
    />,
  );
  expect(screen.getByRole("application")).toHaveAttribute(
    "aria-label",
    /not independent validation/,
  );
  const chart = delivered.at(-1)!;
  expect(chart.data[0].y).toEqual([-0.25]);
  expect(chart.layout.shapes[0].y0).toBe(-0.25);
  expect(chart.layout.yaxis.range).toBeUndefined();
});
it("uses original one-based quality positions and distinguishes unavailable correlation from zero", () => {
  render(<SequencingQualityPlot values={[20.3, 31.1]} language="zh" />);
  expect(delivered.at(-1)!.data[0].x).toEqual([1, 2]);
  render(
    <SampleCorrelationPlot
      data={{
        samples: [
          { column: "A", depth: 10 },
          { column: "B", depth: 12 },
        ],
        correlation_logcpm_pearson: [
          [1, 0],
          [0, 1],
        ],
        correlation_available: [
          [true, false],
          [true, true],
        ],
      }}
      language="en"
    />,
  );
  expect(delivered.at(-1)!.data[0].z).toEqual([
    [1, null],
    [0, 1],
  ]);
});
