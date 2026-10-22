import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { sequenceHits } from "./native-report";
import { NativeReport } from "./NativeReport";
import { SequenceSearchResults } from "./SequenceSearchResults";
import type { Job } from "../types";
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls }: { urls: string[] }) => (
    <div aria-label="Query structure">{urls.join(",")}</div>
  ),
}));
afterEach(cleanup);
// Transport-format fixtures only; these are not distributed biological results.
const structureReport =
  "### ProTrek Structure-Based Search Results\n1. **CONTROL1** (score=52.341, identity=42.0%, length=5)\n   - sequence: `EVQLV`\n";
it("reads native structure-search hits that have no sequence-alignment metric", () => {
  const hits = sequenceHits(structureReport);
  expect(hits).toHaveLength(1);
  expect(hits[0].alignedIdentity).toBe("");
  render(<SequenceSearchResults hits={hits} zh={false} structureSearch />);
  expect(
    screen.getByRole("table", { name: "Antibody-domain hits" }),
  ).toBeVisible();
  expect(screen.getByText("52.341")).toBeVisible();
  expect(screen.queryByRole("button", { name: /identity/ })).toBeNull();
  expect(screen.getByText(/not TM-score, RMSD, affinity/)).toBeVisible();
});
it("preserves native sequence-search metrics and never replaces missing values with zero", () => {
  const text =
    "1. **CONTROL1** (score=53.542, identity=100%, aligned_identity=100.0%, length=5)\n   - sequence: `EVQLV`\n";
  const hit = sequenceHits(text)[0];
  expect(hit).toMatchObject({
    score: "53.542",
    identity: "100",
    alignedIdentity: "100.0",
    length: "5",
  });
  const view = render(
    <SequenceSearchResults
      hits={[{ ...hit, identity: "", alignedIdentity: "" }]}
      zh={false}
    />,
  );
  expect(screen.getAllByText("—")).toHaveLength(2);
  view.unmount();
  expect(sequenceHits("1. **CONTROL1** (score=1e999, length=5)")).toEqual([]);
});
it("places only the declared structure query in the shared left-leading workbench", () => {
  const id = "f5517707-b82a-4f1e-a2ec-962f90526792";
  const job = {
    id: "query",
    request: {
      operation: "harness",
      tool: "protrek-structure",
      payload: { structure_path: "asset:" + id },
      scientific_inputs: [{ asset_id: id }],
    },
  } as unknown as Job;
  const view = render(
    <NativeReport text={structureReport} zh={false} job={job} />,
  );
  expect(screen.getByLabelText("Query structure")).toHaveTextContent(
    "/api/assets/" + id,
  );
  view.rerender(
    <NativeReport
      text={structureReport}
      zh={false}
      job={
        { ...job, request: { ...job.request, scientific_inputs: [] } } as Job
      }
    />,
  );
  expect(screen.queryByLabelText("Query structure")).toBeNull();
});
