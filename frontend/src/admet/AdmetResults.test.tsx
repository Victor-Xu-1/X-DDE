import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import type { MoleculeRef } from "../research/types";
import type { ScientificObject } from "../research/types";
import type { SavedPose } from "../viewer/pose-types";
import { AdmetResults } from "./AdmetResults";
import type { AdmetResult, AdmetRow, Endpoint } from "./types";
const native = vi.hoisted(() => ({ post: vi.fn(), request: vi.fn() }));
vi.mock("../api", async (original) => {
  const actual = await original<typeof import("../api")>();
  return {
    ...actual,
    api: { ...actual.api, post: native.post },
    request: native.request,
  };
});
vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: ({ title }: { title: string }) => (
    <div role="application" aria-label={title} />
  ),
}));

vi.mock("../viewer/StructureViewer", async () => {
  const { usePoseSession } = await import("../viewer/PoseSession");
  return {
    StructureViewer: ({
      urls,
      expectedStructureSha256,
    }: {
      urls: string[];
      expectedStructureSha256?: string;
    }) => {
      const controller = usePoseSession()?.controller;
      return (
        <>
          <span
            aria-label="Selected structure"
            data-source-sha256={expectedStructureSha256}
          >
            {(controller?.pose.urls ?? urls).join("|")}
          </span>
          <button onClick={() => void controller?.prepareInitial()}>
            Prepare computed pose
          </button>
          <button onClick={() => void controller?.minimize("MMFF94s", 100)}>
            Minimize test pose
          </button>
          <button onClick={() => controller?.previous()}>Undo test pose</button>
          <button onClick={() => controller?.next()}>Redo test pose</button>
        </>
      );
    },
  };
});
vi.mock("../chemistry/StateForm", () => ({
  StateForm: ({ initialMolecule }: { initialMolecule: MoleculeRef }) => (
    <output aria-label="Reused source">
      {JSON.stringify(initialMolecule)}
    </output>
  ),
}));
afterEach(() => {
  cleanup();
  native.post.mockReset();
  native.request.mockReset();
});
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
    minimum: 0,
    maximum: 1,
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

async function showCandidates(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: /^Candidate molecules/ }));
}

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
  expect(screen.queryByLabelText("Selected structure")).toBeNull();
  await user.click(screen.getByRole("tab", { name: "3D structure" }));
  expect(screen.getByLabelText("Selected structure")).toHaveTextContent(
    "source-record-2.sdf",
  );
  await showCandidates(user);
  await user.click(screen.getByRole("button", { name: /#1 · Candidate 1/ }));
  expect(screen.queryByLabelText("Selected structure")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Prepare this molecule" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: /#3 · Candidate 3/ }));
  await user.click(screen.getByRole("tab", { name: "3D structure" }));
  expect(screen.getByLabelText("Selected structure")).toHaveTextContent(
    "source-record-3.sdf",
  );
  expect(
    screen.getByRole("button", { name: /#3 · Candidate 3/ }),
  ).toHaveTextContent("Same representation as record #2");
  const prepare = screen.getByRole("button", { name: "Prepare this molecule" });
  const preview = screen.getByLabelText("Selected structure");
  await user.click(prepare);
  expect(
    screen.getByRole("heading", { name: "Molecule preparation" }),
  ).toBeVisible();
  expect(
    JSON.parse(screen.getByLabelText("Reused source").textContent!),
  ).toEqual(result.rows[2].reference);
  await user.click(screen.getByRole("button", { name: "Back to predictions" }));
  expect(prepare).toHaveFocus();
  expect(screen.getByRole("tab", { name: "3D structure" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByLabelText("Selected structure")).toBe(preview);
});
it("honors the requested full panel and offers a compact common-endpoint view", async () => {
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
  expect(screen.getByRole("combobox", { name: "Result group" })).toHaveValue(
    "all",
  );
  expect(
    screen.getByRole("button", { name: "Half life meaning" }),
  ).toBeVisible();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Result group" }),
    "common",
  );
  expect(
    screen.queryByRole("button", { name: "Half life meaning" }),
  ).toBeNull();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Result group" }),
    "all",
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
  const endpointTable = within(
    screen.getByRole("region", { name: "Predicted properties" }),
  ).getAllByRole("table")[0];
  expect(within(endpointTable).getAllByRole("row")).toHaveLength(2);
  await user.click(screen.getByText("Download", { selector: "summary" }));
  expect(
    screen.getByRole("link", { name: "Download prediction table" }),
  ).toHaveAttribute("href", "/api/jobs/job/download?name=predictions.csv");
});

it("keeps all endpoints reachable when early safety was chosen as the initial view", async () => {
  const user = userEvent.setup();
  render(
    <AdmetResults
      job={{ id: "job" } as Job}
      result={{ ...result, options: { ...result.options, view: "safety" } }}
      language="en"
    />,
  );
  expect(screen.getByRole("combobox", { name: "Result group" })).toHaveValue(
    "Toxicity",
  );
  expect(
    screen.queryByRole("button", { name: "Solubility meaning" }),
  ).toBeNull();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Result group" }),
    "all",
  );
  expect(
    screen.getByRole("button", { name: "Solubility meaning" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Half life meaning" }),
  ).toBeVisible();
  await showCandidates(user);
  await user.click(screen.getByText("Columns", { selector: "summary" }));
  await user.click(
    screen.getByRole("checkbox", { name: /Solubility.*log mol\/L/ }),
  );
  expect(
    screen.getByRole("button", { name: /Solubility.*log mol\/L/ }),
  ).toBeVisible();
  await user.click(screen.getByText("Download", { selector: "summary" }));
  expect(
    screen.getByRole("link", { name: "Download original molecule" }),
  ).toHaveAttribute("href", "/api/jobs/job/download?name=source-record-2.sdf");
});

it("links the property landscape to exact record selection and preserves the table view", async () => {
  const user = userEvent.setup();
  render(
    <AdmetResults job={{ id: "job" } as Job} result={result} language="en" />,
  );
  await showCandidates(user);
  await user.type(screen.getByRole("searchbox"), "Candidate 3");
  await user.click(screen.getByRole("tab", { name: "Property landscape" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Inspect record" }),
    "3",
  );
  expect(
    screen.getByRole("heading", { name: "#4 · Candidate 4" }),
  ).toBeVisible();
  await user.click(
    within(screen.getByRole("tablist", { name: "Candidate views" })).getByRole(
      "tab",
      { name: /^Candidate molecules/ },
    ),
  );
  expect(screen.getByRole("searchbox")).toHaveValue("Candidate 3");
});

it("resets record selection for another result and makes empty and rejected outputs explicit", async () => {
  const user = userEvent.setup();
  const view = render(
    <AdmetResults job={{ id: "job" } as Job} result={result} language="en" />,
  );
  await showCandidates(user);
  await user.click(screen.getByRole("button", { name: /#3 · Candidate 3/ }));
  view.rerender(
    <AdmetResults
      job={{ id: "another-job" } as Job}
      result={result}
      language="en"
    />,
  );
  expect(
    screen.getByRole("heading", { name: "#2 · Candidate 2" }),
  ).toBeVisible();
  await showCandidates(user);
  await user.click(screen.getByRole("button", { name: /#1 · Candidate 1/ }));
  await user.click(screen.getByRole("tab", { name: "Predictions" }));
  expect(screen.queryByRole("tab", { name: "3D structure" })).toBeNull();
  expect(
    screen.queryByRole("region", { name: "Predicted properties" }),
  ).toBeNull();
  expect(
    within(screen.getByRole("region", { name: "Selected molecule" })).getByText(
      "Record cannot be parsed",
    ),
  ).toBeVisible();
  view.rerender(
    <AdmetResults
      job={{ id: "empty" } as Job}
      result={{ ...result, rows: [], predicted_count: 0 }}
      language="en"
    />,
  );
  expect(screen.getByText("No molecule results")).toBeVisible();
  expect(screen.queryByRole("tablist")).toBeNull();
});

it("keeps complete endpoint inspection next to either molecule view without a duplicate single-record table", async () => {
  const user = userEvent.setup();
  const single = {
    ...result,
    rows: [row(1)],
    predicted_count: 1,
    previews_sha256: { "source-record-2.sdf": "f".repeat(64) },
  };
  const original = JSON.stringify(single);
  render(
    <AdmetResults
      job={{ id: "single" } as Job}
      result={single}
      language="en"
    />,
  );
  expect(
    screen.queryByRole("tab", { name: /^Candidate molecules/ }),
  ).toBeNull();
  const predictions = screen.getByRole("region", {
    name: "Predicted properties",
  });
  expect(
    within(predictions).getByRole("table", {
      name: "Selected molecule predictions",
    }),
  ).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "3D structure" }));
  expect(screen.getByLabelText("Selected structure")).toHaveAttribute(
    "data-source-sha256",
    "f".repeat(64),
  );
  expect(predictions).toBeVisible();
  const search = screen.getByRole("searchbox", {
    name: "Search predicted endpoints",
  });
  await user.type(search, "hERG");
  expect(
    within(predictions)
      .getByRole("table", { name: "Selected molecule predictions" })
      .querySelectorAll("tbody tr"),
  ).toHaveLength(1);
  await user.click(screen.getByRole("tab", { name: "2D structure" }));
  expect(search).toHaveValue("hERG");
  await user.clear(search);
  await user.type(search, "no-match");
  expect(screen.getByText("No matching endpoints")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Show all endpoints" }));
  expect(search).toHaveValue("");
  expect(
    within(predictions)
      .getByRole("table", { name: "Selected molecule predictions" })
      .querySelectorAll("tbody tr"),
  ).toHaveLength(3);
  expect(JSON.stringify(single)).toBe(original);
});

it.each([false, true])(
  "verifies pose hashes through minimization, undo and redo (prepared: %s)",
  async (prepare) => {
    const user = userEvent.setup();
    const id = (n: number) =>
      `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const prepared = {
      id: id(2),
      kind: "molecule",
      relation: "prepared_from",
      reference: {
        asset_id: id(3),
        version_id: id(2),
        sha256: "b".repeat(64),
        record: 0,
        conformer: 0,
      },
    } as ScientificObject;
    const saved: SavedPose = {
      job_id: id(4),
      pose: {
        ...prepared,
        id: id(5),
        source_job: id(4),
        relation: "edited_from",
        reference: {
          ...prepared.reference,
          asset_id: id(6),
          version_id: id(5),
          sha256: "c".repeat(64),
        },
      },
      energy: {
        before: 20,
        after: 10,
        method: "MMFF94s",
        unit: "kcal/mol",
        converged: true,
      },
      native_score: null,
      receptor: null,
    };
    native.post.mockImplementation(async (path: string) =>
      path.endsWith("/initial")
        ? { state: "ready", pose: prepared }
        : path.endsWith("/save")
          ? saved
          : { id: saved.job_id },
    );
    native.request.mockResolvedValue({ id: saved.job_id, status: "succeeded" });
    const single = {
      ...result,
      rows: [row(1)],
      predicted_count: 1,
      previews_sha256: { "source-record-2.sdf": "f".repeat(64) },
    };
    render(
      <AdmetResults job={{ id: id(1) } as Job} result={single} language="en" />,
    );
    await user.click(screen.getByRole("tab", { name: "3D structure" }));
    const structure = screen.getByLabelText("Selected structure");
    expect(structure).toHaveAttribute("data-source-sha256", "f".repeat(64));
    if (prepare) {
      await user.click(
        screen.getByRole("button", { name: "Prepare computed pose" }),
      );
      expect(structure).toHaveTextContent(`/api/assets/${id(3)}`);
      expect(structure).toHaveAttribute(
        "data-source-sha256",
        prepared.reference.sha256,
      );
    }
    await user.click(
      screen.getByRole("button", { name: "Minimize test pose" }),
    );
    expect(await screen.findByText(`/api/assets/${id(6)}`)).toBeVisible();
    expect(structure).toHaveAttribute(
      "data-source-sha256",
      saved.pose.reference.sha256,
    );
    await user.click(screen.getByRole("button", { name: "Undo test pose" }));
    expect(structure).toHaveTextContent(
      prepare ? `/api/assets/${id(3)}` : "source-record-2.sdf",
    );
    expect(structure).toHaveAttribute(
      "data-source-sha256",
      prepare ? prepared.reference.sha256 : "f".repeat(64),
    );
    await user.click(screen.getByRole("button", { name: "Redo test pose" }));
    expect(structure).toHaveAttribute(
      "data-source-sha256",
      saved.pose.reference.sha256,
    );
  },
);
