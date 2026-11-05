import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Analysis, Job } from "../types";
import { ExampleJobResult } from "./ExampleJobResult";
import { defaults } from "../form-model";
import { useContext } from "react";
import { TemplatePreviewContext } from "./context";
const transport = vi.hoisted(() => ({
  analysis: vi.fn(),
  artifacts: vi.fn(),
  results: vi.fn(),
}));
vi.mock("../api", () => ({
  api: transport,
  artifactUrl: (id: string, name: string) =>
    `/api/jobs/${id}/download?name=${name}`,
}));
vi.mock("../operations/OperationResults", () => ({
  OperationResults: () => {
    transport.results(useContext(TemplatePreviewContext));
    return <div>Authoritative native results</div>;
  },
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls }: { urls: string[] }) => (
    <div>Extra native viewer {urls.join(",")}</div>
  ),
}));
vi.mock("../operations/ConfidencePanel", () => ({
  ConfidencePanel: ({ candidate }: { candidate: string }) => (
    <div>PAE for {candidate}</div>
  ),
}));
afterEach(cleanup);
it("uses the operation result's single native presentation instead of fetching and duplicating its first artifact", () => {
  render(
    <ExampleJobResult
      language="en"
      job={
        {
          id: "native-fold",
          request: { operation: "harness", tool: "fold", payload: {} },
        } as unknown as Job
      }
    />,
  );
  expect(screen.getByText("Authoritative native results")).toBeVisible();
  expect(transport.artifacts).not.toHaveBeenCalled();
  expect(screen.queryByText("Extra native viewer")).not.toBeInTheDocument();
  expect(transport.results).toHaveBeenLastCalledWith(true);
});

it.each(["en", "zh"] as const)(
  "shows the actual retained task identity in %s",
  (language) => {
    render(
      <ExampleJobResult
        language={language}
        job={
          {
            id: "example-dock",
            request: {
              name: "STAT6 · R-group001 neutral · observed-contact-region docking",
              operation: "docking",
            },
          } as unknown as Job
        }
      />,
    );
    expect(screen.getByText(/STAT6 · R-group001 neutral/)).toHaveTextContent(
      language === "zh" ? "结果对应任务：" : "Source task:",
    );
  },
);

it("keeps a fixed prediction sample, its structure and its confidence in sync", async () => {
  const job: Job = {
    id: "retained-prediction",
    request: {
      name: "STAT6 SH2",
      components: [{ kind: "protein", value: "ACDE", count: 1 }],
      parameters: defaults,
    },
    status: "succeeded",
    created_at: "2026-10-30",
    started_at: null,
    finished_at: null,
    error: null,
    parent_id: null,
  };
  const analysis: Analysis = {
    schema_version: 1,
    ligands: [],
    metric_notes: {},
    candidates: [0, 1].map((sample) => ({
      id: "seed-101-sample-" + sample,
      artifact: "model-" + sample + ".cif",
      atom_count: 42,
      chains: ["A"],
      ranking_score: 0.9 - sample * 0.1,
      plddt: 85,
      ptm: null,
      iptm: null,
      has_clash: false,
      rmsd_to_first: 0,
      contacts: [],
    })),
  };
  transport.analysis.mockResolvedValueOnce(analysis);
  render(
    <ExampleJobResult
      language="en"
      job={job}
      initialCandidateId="seed-101-sample-1"
    />,
  );
  expect(await screen.findByText("PAE for seed-101-sample-1")).toBeVisible();
  expect(screen.getByRole("button", { name: "Sample 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByText(/Extra native viewer .*model-1.cif/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Previous sample" }));
  expect(screen.getByText("PAE for seed-101-sample-0")).toBeVisible();
  expect(screen.getByText(/Extra native viewer .*model-0.cif/)).toBeVisible();
});
