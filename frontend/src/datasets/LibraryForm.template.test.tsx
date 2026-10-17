import { readFileSync } from "node:fs";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Asset } from "../operations/types";
import type { DataExample } from "./useDatasetExample";
import type { DatasetTask } from "./types";
import { LibraryForm } from "./LibraryForm";

const fixture = vi.hoisted(() => ({
  example: null as DataExample | null,
  submit: vi.fn(),
  asset: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "STAT6-CHEMBL982109-38-compounds.sdf",
    kind: "library",
    suffix: ".sdf",
    size: 109884,
    sha256: "00b497255bd1bad749d47f689e77b00e535018a0f70192a312da42b9981f53d4",
    created_at: "2026-10-17T00:00:00Z",
  } as Asset,
  preview: {
    columns: [] as string[],
    rows: [],
    format: "sdf",
    table: false,
    sdf_properties: [] as string[],
  },
}));
vi.mock("./useDatasetExample", () => ({
  useDatasetExample: () => fixture.example,
}));
vi.mock("./useTablePreview", () => ({
  useTablePreview: (asset: Asset | null) => ({
    preview: asset ? fixture.preview : null,
    error: "",
  }),
}));
vi.mock("./useDatasetRun", () => ({
  useDatasetRun: () => ({ submit: fixture.submit, busy: false, error: "" }),
}));
vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, error: "", recheck: vi.fn() }),
}));
vi.mock("./SupplierPicker", () => ({ SupplierPicker: () => null }));
vi.mock("./DatasetPicker", () => ({
  DatasetPicker: ({ onChange }: { onChange(asset: Asset): void }) => (
    <button onClick={() => onChange(fixture.asset)}>
      Choose real STAT6 series
    </button>
  ),
}));

beforeAll(() => {
  const source = readFileSync(
    "../src/opendde_workbench/examples/stat6/inputs/STAT6-CHEMBL982109-38-compounds.sdf",
    "utf8",
  );
  expect(source.split(/\r?\n/)[0]).toBe("");
  fixture.preview.sdf_properties = [
    ...new Set([...source.matchAll(/>\s*<([^>]+)>/g)].map((m) => m[1])),
  ];
  expect(fixture.preview.sdf_properties).toContain("Compound_ID");
});
beforeEach(() => {
  fixture.example = null;
  fixture.submit.mockReset();
  fixture.submit.mockResolvedValue(undefined);
});
afterEach(cleanup);

async function finishReview(user: ReturnType<typeof userEvent.setup>) {
  for (
    let step = 0;
    step < 4 &&
    !screen.queryByRole("button", { name: "Submit task", exact: true });
    step++
  ) {
    await user.click(screen.getByRole("button", { name: "Next", exact: true }));
  }
  await user.click(
    screen.getByRole("button", { name: "Submit task", exact: true }),
  );
  await waitFor(() => expect(fixture.submit).toHaveBeenCalledOnce());
  return fixture.submit.mock.lastCall![0] as DatasetTask;
}

it("recognizes an actual compound identifier when every SDF title is blank", async () => {
  const user = userEvent.setup();
  render(
    <LibraryForm tool="library.import" language="en" onCreated={vi.fn()} />,
  );
  await user.click(
    screen.getByRole("button", { name: "Choose real STAT6 series" }),
  );
  await user.click(screen.getByRole("button", { name: "Next", exact: true }));
  const id = screen.getByRole("combobox", {
    name: "Supplier or compound ID",
  }) as HTMLSelectElement;
  expect(["chembl_id", "Compound_ID"]).toContain(id.value);
  await user.selectOptions(id, "Compound_ID");
  expect(id).toHaveValue("Compound_ID");
  const task = await finishReview(user);
  expect(task.payload).toMatchObject({
    kind: "chemistry",
    mode: "prepare",
    id_column: "Compound_ID",
  });
  expect(task.inputs[0].source).toMatchObject({
    asset_id: fixture.asset.id,
    sha256: fixture.asset.sha256,
  });
});

it("retains the reviewed identifier choice, input version and original bounded recipe", async () => {
  const source = {
    asset_id: fixture.asset.id,
    sha256: fixture.asset.sha256,
    record: 0,
    conformer: 0,
    version_id: "22222222-2222-4222-8222-222222222222",
  };
  const task = {
    operation: "library_prepare",
    name: "STAT6 measured source library",
    inputs: [{ role: "data", source, label: "Original series" }],
    sources: [],
    scientific_inputs: [source],
    payload: {
      kind: "chemistry",
      mode: "prepare",
      supplier: "custom",
      id_column: "Compound_ID",
      smiles_column: "SMILES",
      library_name: "STAT6 measured source library",
      delimiter: ",",
      max_records: 40,
      expanded_bytes: 8 * 1024 ** 2,
      max_heavy_atoms: 100,
      source_permission: "official_public_resource",
      source_url: "https://www.ebi.ac.uk/chembl/",
    },
    options: { device: "cpu", cpu: 1, memory_mib: 2048, seed: 2026 },
    time_limit_seconds: 180,
    output_bytes: 1024 ** 3,
  } as DatasetTask;
  fixture.example = {
    task,
    assets: new Map([[fixture.asset.id, fixture.asset]]),
    sources: [],
  };
  const user = userEvent.setup();
  render(
    <LibraryForm tool="library.import" language="en" onCreated={vi.fn()} />,
  );
  await user.click(
    await screen.findByRole("button", { name: "Next", exact: true }),
  );
  expect(
    await screen.findByRole("combobox", { name: "Supplier or compound ID" }),
  ).toHaveValue("Compound_ID");
  const replay = await finishReview(user);
  expect(replay.inputs).toEqual(task.inputs);
  expect(replay.payload).toEqual(task.payload);
  expect(replay.options).toEqual(task.options);
  expect(replay.time_limit_seconds).toBe(180);
  expect(replay.output_bytes).toBe(1024 ** 3);
  expect(fixture.example.task).toEqual(task);
});
