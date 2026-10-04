import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Analysis, Job } from "../types";
import { defaults } from "../form-model";
import {
  PredictionResults,
  type PredictionResultsProps,
} from "./PredictionResults";
const job: Job = {
  id: "00000000-0000-0000-0000-000000000001",
  request: {
    name: "Protein structure",
    components: [{ kind: "protein", value: "ACDE", count: 1 }],
    parameters: defaults,
  },
  status: "succeeded",
  created_at: "2026-09-30",
  started_at: null,
  finished_at: null,
  error: null,
  parent_id: null,
};
const analysis: Analysis = {
  schema_version: 1,
  ligands: [],
  metric_notes: {},
  candidates: [
    {
      id: "sample-0",
      artifact: "structure.cif",
      atom_count: 14,
      chains: ["A"],
      ranking_score: 0.9,
      plddt: 85,
      ptm: null,
      iptm: null,
      has_clash: false,
      rmsd_to_first: 0,
      contacts: [],
    },
  ],
};

function props(): PredictionResultsProps {
  return {
    language: "en",
    job,
    detail: null,
    detailError: false,
    analysis: null,
    loadingAnalysis: false,
    analysisError: "",
    onRetry: vi.fn(),
    onCandidate: vi.fn(),
    urls: [],
    compared: [],
    onCompare: vi.fn(),
    focusResidue: null,
    onResidue: vi.fn(),
    onChanged: vi.fn(),
  };
}
it("keeps preview, candidate selection and exports together, while unavailable analysis cannot offer a report", () => {
  const p = props(),
    { rerender } = render(<PredictionResults {...p} loadingAnalysis />);
  expect(screen.queryByRole("link", { name: /research report/ })).toBeNull();
  rerender(<PredictionResults {...p} analysisError="HTTP 503" />);
  expect(screen.getByRole("alert")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Retry|Reload/ }));
  expect(p.onRetry).toHaveBeenCalledOnce();
  expect(screen.queryByRole("link", { name: /research report/ })).toBeNull();
  rerender(
    <PredictionResults
      {...p}
      analysis={analysis}
      candidate={analysis.candidates[0]}
    />,
  );
  expect(
    screen.getByRole("link", { name: "Download research report (HTML)" }),
  ).toHaveAttribute("href", `/api/jobs/${job.id}/report`);
  expect(screen.getByRole("link", { name: /Export table/ })).toHaveAttribute(
    "href",
    `/api/jobs/${job.id}/candidates.csv`,
  );
  fireEvent.click(screen.getByRole("button", { name: "Conformer 1" }));
  expect(p.onCandidate).toHaveBeenCalledWith("sample-0");
  expect(screen.getByTitle("Interactive molecular structure")).toBeVisible();
});
