import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import { DynamicsResults } from "./DynamicsResults";
import { FreeEnergyResults } from "./FreeEnergyResults";
import type { DynamicsResult, FreeEnergyResult } from "./types";

vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls }: { urls: string[] }) => (
    <div data-testid="coordinate-view">{urls.join(" ")}</div>
  ),
}));
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ label }: { label: string }) => <div>{label} drawing</div>,
}));
const job = { id: "scientific-job" } as Job;
afterEach(cleanup);
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
  timeline.focus();
  await user.keyboard("{ArrowRight}");
  // JSDOM does not implement native range keyboard stepping; chart activation does.
  await user.click(screen.getByRole("button", { name: /0.02000 Time \(ns\)/ }));
  expect(screen.getByTestId("coordinate-view")).toHaveTextContent(
    "frame-2.pdb",
  );
  expect(screen.getByRole("link", { name: /Download frame/ })).toHaveAttribute(
    "href",
    expect.stringContaining("frame-2.pdb"),
  );
  expect(
    screen.getByRole("img", { name: /Residue fluctuations/ }),
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
