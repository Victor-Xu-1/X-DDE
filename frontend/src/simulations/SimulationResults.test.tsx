import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import { DynamicsResults } from "./DynamicsResults";
import { FreeEnergyResults } from "./FreeEnergyResults";
import type { DynamicsResult, FreeEnergyResult } from "./types";
vi.mock("./SimulationForm", () => ({
  SimulationForm: ({ initialTask }: { initialTask: unknown }) => (
    <pre data-testid="continuation-draft">{JSON.stringify(initialTask)}</pre>
  ),
}));

vi.mock("./MolecularViewport", () => ({
  MolecularViewport: ({
    frames,
    frame,
    ligandContext,
    sources,
    fixedLigand,
  }: {
    frames?: string[];
    frame: number;
    ligandContext: boolean;
    sources?: unknown[];
    fixedLigand?: "a" | "b";
  }) => (
    <div
      data-testid="coordinate-view"
      data-ligand-context={ligandContext}
      data-fixed-ligand={fixedLigand}
    >
      {frames?.[frame] ?? JSON.stringify(sources)}
    </div>
  ),
}));
vi.mock("./FreeEnergyNetwork", () => ({
  FreeEnergyNetwork: () => <div>Interactive network</div>,
}));
vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: ({
    title,
    data,
    onPoint,
  }: {
    title: string;
    data: { x: number[]; y: number[] }[];
    onPoint?(point: {
      x: number;
      pointIndex: number;
      curveNumber: number;
    }): void;
  }) => (
    <section role="application" aria-label={title}>
      {data.flatMap((trace, curveNumber) =>
        trace.x?.map((x, i) => (
          <button
            key={`${curveNumber}-${i}`}
            onClick={() => onPoint?.({ x, pointIndex: i, curveNumber })}
          >
            {x.toPrecision(4)} {title}
          </button>
        )),
      )}
    </section>
  ),
}));
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ label }: { label: string }) => <div>{label} drawing</div>,
}));
const job = { id: "scientific-job" } as Job;
afterEach(cleanup);
it("a clicked repeat selects that repeat's exact native snapshot, not the current repeat", async () => {
  const result: DynamicsResult = {
    method: "OpenMM",
    reference: "first production",
    contact_definition: "4 Å",
    replicas: [1, 2].map((repeat) => ({
      repeat,
      seed: 100 + repeat,
      trajectory: `repeat-${repeat}.dcd`,
      checkpoint: `repeat-${repeat}.chk`,
      frames: [1, 2].map((frame) => ({
        artifact: `repeat-${repeat}-frame-${frame}.pdb`,
        time_ns: (repeat * frame) / 10,
        backbone_rmsd_angstrom: frame / 5,
        ligand_rmsd_angstrom: null,
        radius_gyration_angstrom: 12,
        potential_kj_mol: -900,
      })),
      residues: [],
      contacts: [],
    })),
  };
  render(
    <DynamicsResults job={job} result={result} language="en" files={{}} />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: /0.4000 Backbone stability/ }),
  );
  expect(
    screen.getByRole("combobox", { name: "Independent repeat" }),
  ).toHaveValue("1");
  expect(screen.getByTestId("coordinate-view")).toHaveTextContent(
    "repeat-2-frame-2.pdb",
  );
  expect(screen.getByRole("link", { name: /Download frame/ })).toHaveAttribute(
    "href",
    expect.stringContaining("repeat-2-frame-2.pdb"),
  );
});
it("links a sampled time to the exact downloadable snapshot and retains Å/ns units", async () => {
  const result: DynamicsResult = {
    method: "OpenMM",
    reference: "first production",
    contact_definition: "4 Å",
    replicas: [
      {
        repeat: 1,
        seed: 101,
        trajectory: "repeat-1.dcd",
        checkpoint: "repeat-1.chk",
        frames: [
          {
            artifact: "frame-1.pdb",
            time_ns: 0.01,
            backbone_rmsd_angstrom: 0,
            ligand_rmsd_angstrom: null,
            radius_gyration_angstrom: 12,
            potential_kj_mol: -900,
          },
          {
            artifact: "frame-2.pdb",
            time_ns: 0.02,
            backbone_rmsd_angstrom: 0.4,
            ligand_rmsd_angstrom: null,
            radius_gyration_angstrom: 12.1,
            potential_kj_mol: -905,
          },
        ],
        residues: [
          {
            chain: "A",
            number: "10",
            insertion: "",
            name: "TYR",
            rmsf_angstrom: 0.5,
          },
        ],
        contacts: [],
      },
    ],
  };
  const user = userEvent.setup();
  render(
    <DynamicsResults
      job={job}
      result={result}
      language="en"
      files={{ "repeat-1.dcd": "a" }}
    />,
  );
  expect(screen.getByTestId("coordinate-view")).toHaveTextContent(
    "frame-1.pdb",
  );
  const timeline = screen.getByRole("slider", { name: "Trajectory time" });
  expect(screen.getByTestId("coordinate-view")).toHaveAttribute(
    "data-ligand-context",
    "false",
  );
  expect(screen.queryByText("Ligand RMSD")).toBeNull();
  expect(screen.queryByRole("tab", { name: "Ligand stability" })).toBeNull();
  expect(screen.getByRole("tab", { name: "Rg" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    screen.queryByRole("table", { name: "Binding-contact occupancy" }),
  ).toBeNull();
  timeline.focus();
  await user.keyboard("{ArrowRight}");
  // JSDOM does not implement native range keyboard stepping; chart activation does.
  await user.click(
    screen.getByRole("button", { name: /0.02000 Backbone stability/ }),
  );
  expect(screen.getByTestId("coordinate-view")).toHaveTextContent(
    "frame-2.pdb",
  );
  expect(screen.getByRole("link", { name: /Download frame/ })).toHaveAttribute(
    "href",
    expect.stringContaining("frame-2.pdb"),
  );
  expect(
    screen.getByRole("application", { name: /Residue fluctuations/ }),
  ).toBeVisible();
});
it("planned FEP networks display mapped structures and never invented free-energy bars", async () => {
  const result: FreeEnergyResult = {
    stage: "plan",
    method: "OpenFE",
    unit: "kcal/mol",
    direction: "B minus A",
    acceptance: "not_scientifically_accepted",
    nodes: [
      { id: "ligand-1", record: 0, artifact: "ligand-1.sdf", smiles: "CC" },
      { id: "ligand-2", record: 1, artifact: "ligand-2.sdf", smiles: "CCC" },
    ],
    edges: [
      {
        id: "edge-1",
        a: "ligand-1",
        b: "ligand-2",
        mapping_score: 0.8,
        atom_map: [
          [0, 0],
          [1, 1],
        ],
      },
    ],
  };
  render(
    <FreeEnergyResults job={job} result={result} language="en" files={{}} />,
  );
  expect(screen.getByText("Network planned")).toBeVisible();
  expect(screen.getByText("ligand-1 drawing")).toBeVisible();
  expect(
    screen.queryByRole("img", {
      name: "Relative binding free energies with uncertainty",
    }),
  ).toBeNull();
  await userEvent.click(
    screen.getByRole("tab", { name: "Sampling and convergence" }),
  );
  expect(
    screen.getByText(/become available after FEP execution/),
  ).toBeVisible();
});
it("continuing a planned network preserves exact inputs and requires a reviewed new calculation", async () => {
  const reference = {
    asset_id: "00000000-0000-0000-0000-000000000001",
    sha256: "a".repeat(64),
    record: 0,
    conformer: 0,
  };
  const plannedJob = {
    id: "planned-job",
    status: "succeeded",
    created_at: "2026-10-08T00:00:00Z",
    started_at: null,
    finished_at: null,
    error: null,
    parent_id: null,
    request: {
      operation: "binding_free_energy",
      name: "TYK2",
      inputs: [{ role: "structure", source: reference }],
      scientific_inputs: [reference],
      payload: {
        kind: "openfe",
        stage: "plan",
        records: [0, 1],
        production_ns: 5,
      },
      options: { device: "cpu", cpu: 2, memory_mib: 8192, seed: 101 },
    },
  } satisfies Job;
  const result: FreeEnergyResult = {
    stage: "plan",
    method: "OpenFE",
    unit: "kcal/mol",
    direction: "B minus A",
    acceptance: "not_scientifically_accepted",
    nodes: [
      { id: "ligand-1", record: 0, artifact: "1.sdf", smiles: "CC" },
      { id: "ligand-2", record: 1, artifact: "2.sdf", smiles: "CCC" },
    ],
    edges: [
      {
        id: "edge",
        a: "ligand-1",
        b: "ligand-2",
        mapping_score: 0.8,
        atom_map: [[0, 0]],
      },
    ],
  };
  const onCreated = vi.fn();
  render(
    <FreeEnergyResults
      job={plannedJob}
      result={result}
      language="en"
      files={{}}
      onCreated={onCreated}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Review and run FEP" }),
  );
  const draft = JSON.parse(
    screen.getByTestId("continuation-draft").textContent!,
  );
  expect(draft.payload).toEqual({
    ...plannedJob.request.payload,
    stage: "calculate",
  });
  expect(draft.scientific_inputs).toEqual(plannedJob.request.scientific_inputs);
  expect(plannedJob.request.payload.stage).toBe("plan");
  expect(onCreated).not.toHaveBeenCalled();
});
