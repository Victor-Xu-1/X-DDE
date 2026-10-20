import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SeriesEvidencePlots } from "./SeriesEvidencePlots";
import type { SeriesRow } from "./chart-documents";
const delivered = vi.hoisted(() => [] as any[]);
vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: (props: any) => {
    delivered.push(props);
    return <div role="application" aria-label={props.title} />;
  },
}));
afterEach(() => {
  cleanup();
  delivered.length = 0;
});
const rows: SeriesRow[] = [
  { kind: "di", block_a: "B2", block_b: "C2", score: 5, members: 10 },
  ...Array.from({ length: 25 }, (_, i) => ({
    kind: "mono",
    cycle_a: 1,
    block_a: "B" + i,
    block_b: "",
    score: i,
    members: i + 1,
    lower: i / 2,
    upper: i * 2,
    selection: i * 3,
    reference: i,
  })),
  {
    kind: "mono",
    cycle_a: 2,
    block_a: "C1",
    block_b: "",
    score: 8,
    members: 4,
  },
];

it("switches native mono/di views, cycles, excerpt coverage and full block display without losing zeros or counts", async () => {
  render(<SeriesEvidencePlots series={rows} totalSeries={90} language="en" />);
  expect(screen.getByRole("application", { name: /Disynthon/ })).toBeVisible();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Monosynthons" }));
  expect(delivered.at(-1).data[1].x).toHaveLength(20);
  expect(screen.getByText(/20 \/ 25/)).toBeVisible();
  expect(screen.getByText(/series excerpt/)).toBeVisible();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Display count" }),
    "all",
  );
  const native = delivered.at(-1);
  expect(native.data[1].x).toEqual(
    Array.from({ length: 25 }, (_, i) => 24 - i),
  );
  expect(native.data[0].x.slice(-3)).toEqual([0, 0, null]);
  expect(native.data[1].text[0]).toContain("72 / 24");
  expect(native.layout.xaxis.type).not.toBe("log");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Library cycle" }),
    "2",
  );
  expect(delivered.at(-1).data[1].y).toEqual(["C1"]);
  expect(rows[1].block_a).toBe("B0");
});

it("does not manufacture missing monosynthons in retained chart excerpts", async () => {
  render(<SeriesEvidencePlots series={[rows[0]]} language="zh" />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "单砌块富集" }));
  expect(screen.getByText(/未报告单砌块/)).toBeVisible();
  expect(screen.queryByRole("application")).toBeNull();
});
