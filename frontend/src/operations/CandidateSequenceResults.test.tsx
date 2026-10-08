import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import { CandidateSequenceResults } from "./CandidateSequenceResults";
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls }: { urls: string[] }) => (
    <div role="region" aria-label="Native structure">
      {urls.join("|")}
    </div>
  ),
}));
afterEach(cleanup);
const job = {
  id: "fold-job",
  request: { operation: "harness", tool: "fold", payload: {} },
} as Job;
it("starts with the selected candidate's exact structure and switches sequence/file together", async () => {
  const candidates = [
    {
      candidate_id: "binder-A",
      sequence: "EVQLVESGG",
      structure_path: "a.cif",
      metrics: { iptm: 0.32, ptm: 0.74, plddt: 0.707 },
    },
    {
      candidate_id: "binder-B",
      sequence: "DIQMTQSP",
      structure_path: "b.cif",
      metrics: { iptm: 0.5 },
    },
  ];
  const original = JSON.stringify(candidates);
  render(
    <CandidateSequenceResults
      job={job}
      language="en"
      candidates={candidates}
      structures={["b.cif", "a.cif"]}
    />,
  );
  expect(screen.getByRole("tab", { name: "3D structure" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    screen.getByRole("region", { name: "Native structure" }),
  ).toHaveTextContent("name=a.cif");
  const user = userEvent.setup();
  await user.click(
    within(
      screen.getByRole("table", { name: "Sequence candidates" }),
    ).getByRole("button", { name: "binder-B" }),
  );
  expect(
    screen.getByRole("region", { name: "Native structure" }),
  ).toHaveTextContent("name=b.cif");
  await user.click(screen.getByRole("tab", { name: "Sequence comparison" }));
  expect(screen.getByText("DIQMTQSP")).toBeInTheDocument();
  expect(JSON.stringify(candidates)).toBe(original);
});
it("does not claim an equal-count file as a candidate pose; keeps unmatched files reachable", async () => {
  render(
    <CandidateSequenceResults
      job={job}
      language="en"
      candidates={[{ candidate_id: "unbound", sequence: "EVQL" }]}
      structures={["orphan.cif"]}
    />,
  );
  expect(
    screen.queryByRole("tab", { name: "3D structure" }),
  ).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByText("Other structure files · 1"));
  await userEvent.setup().click(screen.getByText("orphan.cif"));
  expect(
    screen.getByRole("region", { name: "Native structure" }),
  ).toHaveTextContent("name=orphan.cif");
});
