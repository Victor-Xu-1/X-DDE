import { expect, it, vi } from "vitest";
vi.hoisted(() =>
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-viewer"),
);
import { GLModel, type AtomSpec } from "3dmol";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  nonExchangeableHydrogens,
  hideNonExchangeableHydrogens,
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
  expect(nonExchangeableHydrogens(atoms)).toEqual([1, 8]);
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
    hideNonExchangeableHydrogens(model);
    expect(atoms[1].style?.stick).toBeUndefined();
    expect(atoms[3].style?.stick?.radius).toBe(0.14);
    expect(atoms.map((a) => [a.x, a.y, a.z, [...(a.bonds ?? [])]])).toEqual(
      original,
    );
  }
});
it("applies the same rule to protein, ligand and any other explicit non-donor hydrogen", () => {
  const atoms = [
    { index: 0, elem: "C", bonds: [1, 2, 3], hetflag: true, resn: "JQ1" },
    { index: 1, elem: "H", bonds: [0], hetflag: true, resn: "JQ1" },
    { index: 2, elem: "H", bonds: [0], hetflag: false, resn: "ALA" },
    { index: 3, elem: "H", bonds: [0], hetflag: true, resn: "HOH" },
  ] as AtomSpec[];
  expect(nonExchangeableHydrogens(atoms)).toEqual([1, 2, 3]);
});

it.each(["STAT6-user-warhead", "STAT6-user-PROTAC"])(
  "renders the actual minimized %s source with donor H only and unchanged pose",
  (name) => {
    const file = resolve(
      process.cwd(),
      `../src/opendde_workbench/examples/stat6/inputs/${name}.sdf`,
    );
    const raw = readFileSync(file, "utf8"),
      model = new GLModel(0);
    model.addMolData(raw, "sdf", { keepH: true });
    const atoms = model.selectedAtoms({});
    const before = atoms.map((atom) => [
      atom.elem,
      atom.x,
      atom.y,
      atom.z,
      atom.bonds,
    ]);
    const excluded = new Set(nonExchangeableHydrogens(atoms));
    const donors = atoms.filter(
      (atom) => atom.elem === "H" && !excluded.has(atom.index!),
    );
    expect(excluded.size).toBeGreaterThan(15);
    expect(donors.length).toBeGreaterThan(0);
    model.setStyle({}, { stick: { radius: 0.14 } });
    hideNonExchangeableHydrogens(model);
    for (const atom of atoms) {
      if (excluded.has(atom.index!)) expect(atom.style?.stick).toBeUndefined();
      else expect(atom.style?.stick).toBeDefined();
    }
    expect(
      atoms.map((atom) => [atom.elem, atom.x, atom.y, atom.z, atom.bonds]),
    ).toEqual(before);
    expect(readFileSync(file, "utf8")).toBe(raw);
  },
);
