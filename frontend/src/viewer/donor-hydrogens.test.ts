import { expect, it, vi } from "vitest";
vi.hoisted(() =>
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-viewer"),
);
import { GLModel, type AtomSpec } from "3dmol";
import {
  nonDonorLigandHydrogens,
  hideNonDonorLigandHydrogens,
} from "./donor-hydrogens";

it("keeps explicit N/O/S donor hydrogens, hides carbon hydrogens and preserves all input bonds and coordinates", () => {
  const atoms = [
    { index: 0, elem: "C", bonds: [1], x: 1, y: 2, z: 3 },
    { index: 1, elem: "H", bonds: [0], x: 2, y: 2, z: 3 },
    { index: 2, elem: "N", bonds: [3], x: 3, y: 2, z: 1 },
    { index: 3, elem: "H", bonds: [2], x: 4, y: 2, z: 1 },
    { index: 4, elem: "O", bonds: [5], x: 2, y: 3, z: 1 },
    { index: 5, elem: "H", bonds: [4], x: 2, y: 4, z: 1 },
    { index: 6, elem: "S", bonds: [7], x: 3, y: 1, z: 2 },
    { index: 7, elem: "D", bonds: [6], x: 3, y: 1, z: 3 },
    { index: 8, elem: "H", bonds: [], x: 4, y: 4, z: 4 },
  ] as AtomSpec[];
  const original = JSON.stringify(atoms);
  expect(nonDonorLigandHydrogens(atoms, true)).toEqual([1, 8]);
  expect(JSON.stringify(atoms)).toBe(original);
});
it("the actual molecular renderer removes carbon-H sticks but retains N-H sticks in both overlay models", () => {
  for (const id of [0, 1]) {
    const model = new GLModel(id);
    model.addAtoms([
      { elem: "C", x: 0, y: 0, z: 0, bonds: [1], bondOrder: [1] },
      { elem: "H", x: 1, y: 0, z: 0, bonds: [0], bondOrder: [1] },
      { elem: "N", x: 2, y: 1, z: 0, bonds: [3], bondOrder: [1] },
      { elem: "H", x: 3, y: 1, z: 0, bonds: [2], bondOrder: [1] },
    ]);
    const atoms = model.selectedAtoms({}),
      original = atoms.map((a) => [a.x, a.y, a.z, [...(a.bonds ?? [])]]);
    model.setStyle({}, { stick: { radius: 0.14 } });
    hideNonDonorLigandHydrogens(model, true);
    expect(atoms[1].style?.stick).toBeUndefined();
    expect(atoms[3].style?.stick?.radius).toBe(0.14);
    expect(atoms.map((a) => [a.x, a.y, a.z, [...(a.bonds ?? [])]])).toEqual(
      original,
    );
  }
});
it("applies ligand display policy separately from protein and water hydrogens in complexes", () => {
  const atoms = [
    { index: 0, elem: "C", bonds: [1, 2, 3], hetflag: true, resn: "JQ1" },
    { index: 1, elem: "H", bonds: [0], hetflag: true, resn: "JQ1" },
    { index: 2, elem: "H", bonds: [0], hetflag: false, resn: "ALA" },
    { index: 3, elem: "H", bonds: [0], hetflag: true, resn: "HOH" },
  ] as AtomSpec[];
  expect(nonDonorLigandHydrogens(atoms, false)).toEqual([1]);
});
