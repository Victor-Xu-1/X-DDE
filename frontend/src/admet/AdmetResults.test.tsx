import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import type { MoleculeRef } from "../research/types";
import { AdmetResults } from "./AdmetResults";
import type { AdmetResult, AdmetRow, Endpoint } from "./types";

vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls }: { urls: string[] }) => (
    <span aria-label="Selected structure">{urls.join("|")}</span>
  ),
}));
vi.mock("../chemistry/StateForm", () => ({
  StateForm: ({ initialMolecule }: { initialMolecule: MoleculeRef }) => (
    <output aria-label="Reused source">
      {JSON.stringify(initialMolecule)}
    </output>
  ),
}));
afterEach(cleanup);
// UI state fixtures only. Actual predictions are verified independently by the native CI gate.
const source = { asset_id: "original-file", sha256: "a".repeat(64) };
function row(record: number, failed = false): AdmetRow {
  return {
    record,
    name: "Candidate " + (record + 1),
    smiles: failed ? null : "CCO",
    duplicate_of_record: record === 2 ? 1 : null,
    status: failed ? "failed" : "predicted",
    reason: failed ? "invalid_sdf_record" : null,
    predictions: failed
      ? {}
      : { hERG: 0.6, Solubility_AqSolDB: -1.2, Half_Life_Obach: 2.3 },
    reference: failed
      ? undefined
      : { ...source, record, conformer: 0, version_id: null },
    preview: failed ? null : "source-record-" + (record + 1) + ".sdf",
  };
}
const endpoints: Endpoint[] = [
  {
    id: "hERG",
    name: "hERG",
    category: "Toxicity",
    task_type: "classification",
    unit: "-",
    species: "human",
    source_url: "https://tdcommons.ai/single_pred_tasks/tox/",
    source_dataset_size: 100,
    reference_metrics: { AUROC: 0.8 },
  },
  {
    id: "Solubility_AqSolDB",
    name: "Solubility",
    category: "Absorption",
    task_type: "regression",
    unit: "log mol/L",
    species: "-",
    source_url: "https://tdcommons.ai/single_pred_tasks/adme/",
    source_dataset_size: 100,
    reference_metrics: { "R^2": 0.5 },
  },
  {
    id: "Half_Life_Obach",
    name: "Half life",
    category: "Excretion",
    task_type: "regression",
    unit: "log h",
    species: "human",
    source_url: "https://tdcommons.ai/single_pred_tasks/adme/",
    source_dataset_size: 100,
    reference_metrics: { "R^2": -0.1 },
  },
];
const result = {
  operation: "admet_predict",
  complete: true,
  schema_version: 1,
  source,
  source_kind: "library",
  source_name: "Original library.sdf",
  options: { view: "all", cpu: 1, memory_mib: 4096 },
  rows: [row(0, true), row(1), row(2), row(3)],
  predicted_count: 3,
  classification: "partial",
  models_executed: true,
  versions: { "admet-ai": "2.0.1", chemprop: "2.2.2" },
  endpoints,
  upstream_commit: "c".repeat(40),
  csv_sha256: "d".repeat(64),
  previews_sha256: {},
  endpoint_metadata_sha256: "e".repeat(64),
  drugbank_reference: "disabled",
  applicability_domain: "not_established",
  uncertainty: "not_provided_by_native_api",
} as AdmetResult;
it("retains invalid/duplicate original indices and switches exact previews and reusable inputs", async () => {
  const user = userEvent.setup();
  render(
    <AdmetResults
      job={{ id: "job" } as Job}
      result={result}
      language="en"
      onCreated={vi.fn()}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Predicted 3 / 4");
  expect(screen.getByLabelText("Selected structure")).toHaveTextContent(
    "source-record-2.sdf",
  );
  await user.click(screen.getByRole("button", { name: /#1 · Candidate 1/ }));
  expect(screen.queryByLabelText("Selected structure")).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Reuse original molecule/ }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: /#3 · Candidate 3/ }));
  expect(screen.getByLabelText("Selected structure")).toHaveTextContent(
    "source-record-3.sdf",
  );
  expect(
    screen.getByRole("button", { name: /#3 · Candidate 3/ }),
  ).toHaveTextContent("Same representation as record #2");
  await user.click(
    screen.getByRole("button", { name: /Reuse original molecule/ }),
  );
  expect(
    JSON.parse(screen.getByLabelText("Reused source").textContent!),
  ).toEqual(result.rows[2].reference);
  await user.click(screen.getByRole("button", { name: "Back to predictions" }));
  expect(screen.getByLabelText("Selected structure")).toHaveTextContent(
    "source-record-3.sdf",
  );
});
it("defaults to common endpoints, provides real meaning help, and exposes all units only on request", async () => {
  const user = userEvent.setup();
  render(
    <AdmetResults job={{ id: "job" } as Job} result={result} language="en" />,
  );
  const help = screen.getByRole("button", { name: "hERG meaning" });
  expect(help).toBeVisible();
  await user.click(help);
  expect(screen.getByRole("tooltip")).toHaveTextContent(
    "Native label1 means hERG blockade.",
  );
  expect(
    screen.queryByRole("button", { name: "Half life meaning" }),
  ).toBeNull();
  await user.click(
    screen.getByRole("checkbox", { name: "Show every endpoint" }),
  );
  const halfLifeHelp = screen.getByRole("button", {
    name: "Half life meaning",
  });
  expect(halfLifeHelp).toBeVisible();
  await user.click(halfLifeHelp);
  expect(
    screen.getByText(/Upstream reference R² is negative/),
  ).toBeInTheDocument();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Result group" }),
    "Toxicity",
  );
  expect(
    within(screen.getAllByRole("table")[0]).getAllByRole("row"),
  ).toHaveLength(2);
  expect(
    screen.getByRole("link", { name: "Download prediction table" }),
  ).toHaveAttribute("href", "/api/jobs/job/download?name=predictions.csv");
});
