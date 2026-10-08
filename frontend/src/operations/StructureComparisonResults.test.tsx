import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import { StructureComparisonResults } from "./StructureComparisonResults";
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls }: { urls: string[] }) => (
    <div role="region" aria-label="Input structure">
      {urls.join("|")}
    </div>
  ),
}));
afterEach(cleanup);
it("shows compact original metrics with exact precision and two independent source structures", () => {
  const a = "a97d8c4f-4562-4387-abc5-16f569581271",
    b = "b97d8c4f-4562-4387-abc5-16f569581271";
  const job = {
    request: {
      operation: "harness",
      payload: { reference_path: "asset:" + a, mobile_path: "asset:" + b },
      scientific_inputs: [
        { asset_id: a, record: 0, conformer: 0 },
        { asset_id: b, record: 0, conformer: 0 },
      ],
    },
  } as unknown as Job;
  render(
    <StructureComparisonResults
      job={job}
      language="en"
      value={{
        rmsd: 37.16928545636545,
        matched_target_atoms: 97,
        matched_binder_atoms: 275,
      }}
    />,
  );
  expect(screen.getByTitle("37.16928545636545")).toHaveTextContent("37.1693");
  expect(screen.getByText("97")).toBeVisible();
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  expect(
    screen.getAllByRole("region", { name: "Input structure" }),
  ).toHaveLength(2);
  expect(screen.getByText(/did not provide verified aligned/)).toBeVisible();
  expect(
    screen
      .getAllByRole("link", { name: "Download this structure" })
      .map((link) => link.getAttribute("href")),
  ).toEqual(["/api/assets/" + a, "/api/assets/" + b]);
});
it("keeps native zero and missing values distinct without inventing source viewers", () => {
  render(
    <StructureComparisonResults
      job={{ request: { operation: "harness", payload: {} } } as unknown as Job}
      language="en"
      value={{ rmsd: 0, matched_target_atoms: NaN }}
    />,
  );
  expect(screen.getByTitle("0")).toHaveTextContent("0");
  expect(screen.getAllByText("—")).toHaveLength(2);
  expect(
    screen.queryByRole("region", { name: "Input structure" }),
  ).not.toBeInTheDocument();
});
