import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SequencingDiagnostics } from "./SequencingDiagnostics";
import { nativeQuality } from "./sequencing-quality.test-data";

vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: ({ title }: { title: string }) => (
    <div role="application" aria-label={title} />
  ),
}));
afterEach(cleanup);

it("exposes the real 709/702 complete evidence and one truncated observation separately", () => {
  render(<SequencingDiagnostics language="en" document={nativeQuality} />);
  const region = screen.getByRole("region", { name: "UMI completeness" });
  expect(within(region).getByText("DEL006: 11 bases")).toBeVisible();
  expect(
    within(region).getByRole("row", { name: "Complete length 709 702" }),
  ).toBeVisible();
  expect(
    within(region).getByRole("row", { name: "Truncated 1 1" }),
  ).toBeVisible();
  expect(
    within(region).getByText(/not measured molecule counts/),
  ).toBeVisible();
  expect(
    screen.getByRole("application", { name: "Reasons reads were not decoded" }),
  ).toBeVisible();
});

it("labels historical missing assessment in Chinese without inventing a zero or a pass", () => {
  render(
    <SequencingDiagnostics
      language="zh"
      document={{ reads: 1000, decoded: 710, mean_quality: [30] }}
    />,
  );
  expect(screen.getByText(/此历史结果未评估 UMI 完整性/)).toBeVisible();
  expect(screen.queryByRole("table")).toBeNull();
});
