import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ScientificResults } from "./ScientificResults";
import type { NativeResult } from "./types";
import type { Job } from "../types";

vi.mock("../presentation/MolecularPreview", () => ({
  MolecularPreview: (props: unknown) => (
    <output aria-label="Selected molecular sources">
      {JSON.stringify(props)}
    </output>
  ),
}));
vi.mock("../presentation/MoleculeImage", () => ({ MoleculeImage: () => null }));

afterEach(cleanup);

it("opens a reviewed candidate while keeping native rows and allowing normal selection", () => {
  const result: NativeResult = {
    operation: "boltz_predict",
    program: "boltz",
    version: "2.2.1",
    candidates: [1, 2, 3].map((index) => ({
      id: `structure-00${index}`,
      smiles: "CN(C)C(=O)c1cc2ccc(F)cc2[nH]1",
      artifact: `structure-00${index}.cif`,
      geometry: "predicted_structure" as const,
      metrics: [],
    })),
    metrics: [],
    artifact_sha256: {},
    interactions: [],
    validation_points: [],
  };
  const selected = () =>
    JSON.parse(screen.getByLabelText("Selected molecular sources").textContent!)
      .urls;
  const view = render(
    <ScientificResults
      job={{ id: "first" } as Job}
      result={result}
      language="en"
      initialCandidateId="structure-003"
    />,
  );
  expect(selected()).toEqual([
    "/api/jobs/first/download?name=structure-003.cif",
  ]);
  for (const id of ["structure-001", "structure-002", "structure-003"])
    expect(screen.getByRole("button", { name: id })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "structure-001" }));
  expect(selected()).toEqual([
    "/api/jobs/first/download?name=structure-001.cif",
  ]);
  view.rerender(
    <ScientificResults
      job={{ id: "second" } as Job}
      result={result}
      language="en"
      initialCandidateId="structure-003"
    />,
  );
  expect(selected()).toEqual([
    "/api/jobs/second/download?name=structure-003.cif",
  ]);
  view.rerender(
    <ScientificResults
      job={{ id: "second" } as Job}
      result={result}
      language="en"
      initialCandidateId="absent"
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "reviewed candidate is unavailable",
  );
  expect(screen.queryByLabelText("Selected molecular sources")).toBeNull();
});

it("offers the restored scientific structure and sequence without transport aliases", () => {
  const result: NativeResult = {
    operation: "ligandmpnn_design",
    program: "ligandmpnn",
    version: "fixed-native-version",
    candidates: [],
    metrics: [],
    interactions: [],
    validation_points: [],
    artifact_sha256: {
      "packed-001.cif": "a".repeat(64),
      "native-packed-001.pdb": "b".repeat(64),
      "designed-sequences.fasta": "c".repeat(64),
    },
  };
  render(
    <ScientificResults
      job={{ id: "retained" } as Job}
      result={result}
      language="en"
    />,
  );
  expect(screen.getByRole("link", { name: "packed-001.cif" })).toBeVisible();
  expect(
    screen.getByRole("link", { name: "designed-sequences.fasta" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "native-packed-001.pdb" }),
  ).toBeNull();
});

it("shows native energy units and never pools equal metric names across incompatible units", () => {
  const method = "OpenMM vacuum potential with backbone positional restraints";
  const result: NativeResult = {
    operation: "structure_refine",
    program: "openmm",
    version: "8.6.1",
    candidates: [
      {
        id: "refined-structure",
        geometry: "source_frame",
        metrics: [
          {
            name: "Initial potential energy",
            value: -50383.56773217576,
            unit: "kJ/mol",
            method,
            meaning: "energy",
          },
          {
            name: "Final potential energy",
            value: -58503.15506459447,
            unit: "kJ/mol",
            method,
            meaning: "energy",
          },
        ],
      },
      {
        id: "independent-unit-result",
        geometry: "none",
        metrics: [
          {
            name: "Final potential energy",
            value: -13982.5896425895,
            unit: "kcal/mol",
            method: "Separate unit context",
            meaning: "energy",
          },
        ],
      },
    ],
    metrics: [],
    artifact_sha256: {},
    interactions: [],
    validation_points: [],
  };
  render(
    <ScientificResults
      job={{ id: "native-refinement" } as Job}
      result={result}
      language="en"
    />,
  );
  expect(
    screen.getByRole("columnheader", {
      name: /Initial energy.*kJ\/mol/,
    }),
  ).toBeVisible();
  expect(
    screen.getByRole("columnheader", {
      name: /Final energy.*kJ\/mol/,
    }),
  ).toBeVisible();
  expect(
    screen.getByRole("columnheader", {
      name: /Final energy.*kcal\/mol/,
    }),
  ).toBeVisible();
  expect(screen.getAllByTitle(`${method} · kJ/mol`)).toHaveLength(2);
  const foreign = screen.getByText("independent-unit-result").closest("tr")!;
  expect(within(foreign).getAllByText("—")).toHaveLength(2);
  expect(within(foreign).getByText("-1.398e+4")).toBeVisible();
});

it("keeps declared stereochemistry separate from unbound 3D geometry when selecting a candidate", () => {
  const result: NativeResult = {
    operation: "reinvent_design",
    program: "reinvent",
    version: "4.8",
    candidates: [
      {
        id: "molecule-002",
        smiles: "CN1CCCN(Cc2ncc(-c3ccc4cc(C(=O)N(C)C)[nH]c4c3F)cn2)CC1",
        artifact: "molecule-002.sdf",
        geometry: "unbound_conformer",
        metrics: [],
      },
      {
        id: "explicit-configuration",
        smiles: "C[C@H](O)c1ccccc1",
        artifact: "explicit-configuration.sdf",
        geometry: "unbound_conformer",
        metrics: [],
      },
    ],
    metrics: [],
    artifact_sha256: { "molecule-002.sdf": "a".repeat(64) },
    interactions: [],
    validation_points: [],
  };
  render(
    <ScientificResults
      job={{ id: "native-study" } as Job}
      result={result}
      language="en"
    />,
  );
  const selected = () =>
    JSON.parse(
      screen.getByLabelText("Selected molecular sources").textContent!,
    );
  expect(selected().source).toEqual({ smiles: result.candidates[0].smiles });
  expect(selected().urls).toEqual([
    "/api/jobs/native-study/download?name=molecule-002.sdf",
  ]);
  expect(
    screen.getByRole("link", { name: "molecule-002.sdf" }),
  ).toHaveAttribute(
    "href",
    "/api/jobs/native-study/download?name=molecule-002.sdf",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "explicit-configuration" }),
  );
  expect(selected().source).toEqual({ smiles: "C[C@H](O)c1ccccc1" });
  expect(selected().urls).toEqual([
    "/api/jobs/native-study/download?name=explicit-configuration.sdf",
  ]);
});
