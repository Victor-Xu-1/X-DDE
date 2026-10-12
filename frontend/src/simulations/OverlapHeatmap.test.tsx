import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { OverlapHeatmap } from "./OverlapHeatmap";
import { FreeEnergyForest } from "./FreeEnergyForest";
import type { FreeEnergyEdge } from "./types";

const { capture, download } = vi.hoisted(() => ({
  capture: vi.fn(),
  download: vi.fn(),
}));
vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: (props: { title: string }) => {
    capture(props);
    return <div role="application" aria-label={props.title} />;
  },
}));
vi.mock("../presentation/visual-export", () => ({ downloadBlob: download }));
afterEach(() => {
  cleanup();
  capture.mockClear();
  download.mockClear();
});
it("keeps directional values inspectable and downloads the selected matrix without rounding", async () => {
  render(
    <OverlapHeatmap
      matrix={[
        [0.9, 0.123456789],
        [0.06, 0.94],
      ]}
      language="en"
    />,
  );
  const table = screen.getByRole("table", {
    name: "Directional adjacent-state overlap",
  });
  expect(table).toHaveTextContent("0.1235");
  expect(table).toHaveTextContent("0.0600");
  expect(screen.getByText("0.1235")).toHaveAttribute("title", "0.123456789");
  await userEvent.click(
    screen.getByRole("button", { name: "Download values" }),
  );
  expect(await download.mock.lastCall![0].text()).toContain(
    "0,1,0.123456789,0.06",
  );
  const layout = capture.mock.lastCall![0].layout;
  expect(layout.xaxis.range).toEqual([-0.5, 1.5]);
  expect(layout.yaxis.range).toEqual([1.5, -0.5]);
});
it("a missing matrix has an explicit bilingual state and no misleading figure", () => {
  render(<OverlapHeatmap matrix={undefined} language="zh" />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "没有有效的采样重叠矩阵",
  );
  expect(capture).not.toHaveBeenCalled();
  expect(screen.queryByRole("table")).toBeNull();
});
it.each([1.2, -1.2, 0])(
  "keeps the zero reference and every signed error bar visible for %s kcal/mol",
  (value) => {
    const edge = {
      id: "e",
      a: "A",
      b: "B",
      delta_delta_g_kcal_mol: value,
      uncertainty_kcal_mol: 0.2,
    } as FreeEnergyEdge;
    render(
      <FreeEnergyForest
        edges={[edge]}
        selected="e"
        onSelect={() => {}}
        language="en"
      />,
    );
    const plot = capture.mock.lastCall![0];
    expect(plot.layout.xaxis.range[0]).toBeLessThanOrEqual(
      Math.min(0, value - 0.2),
    );
    expect(plot.layout.xaxis.range[1]).toBeGreaterThanOrEqual(
      Math.max(0, value + 0.2),
    );
    expect(plot.data[0].x).toEqual([value]);
    expect(plot.data[0].error_x.array).toEqual([0.2]);
  },
);
it("invalid estimates and missing uncertainty do not acquire fabricated zero error bars", () => {
  const edges = [
    { delta_delta_g_kcal_mol: NaN, uncertainty_kcal_mol: 0.2 },
    { delta_delta_g_kcal_mol: 1, uncertainty_kcal_mol: -0.2 },
    { delta_delta_g_kcal_mol: 1, uncertainty_kcal_mol: null },
  ] as FreeEnergyEdge[];
  render(
    <FreeEnergyForest
      edges={edges}
      selected=""
      onSelect={() => {}}
      language="en"
    />,
  );
  expect(capture).not.toHaveBeenCalled();
});
