import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    screen.getByRole("button", { name: "explicit-configuration", exact: true }),
  );
  expect(selected().source).toEqual({ smiles: "C[C@H](O)c1ccccc1" });
  expect(selected().urls).toEqual([
    "/api/jobs/native-study/download?name=explicit-configuration.sdf",
  ]);
});
