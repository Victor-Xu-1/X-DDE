import { expect, it } from "vitest";
import type { AtomSpec } from "3dmol";
import { spatialMolecule } from "./initial-geometry";

it("keeps real nonplanar coordinates when an experimental MOL file has no dimension flag", () => {
  const atoms = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ] as AtomSpec[];
  expect(spatialMolecule(atoms, false)).toBe(true);
  expect(
    spatialMolecule(
      atoms.map((atom) => ({ ...atom, z: 0 })),
      false,
    ),
  ).toBe(false);
  expect(
    spatialMolecule(
      atoms.map((atom) => ({ ...atom, z: atom.x! + atom.y! })),
      false,
    ),
  ).toBe(false);
  expect(
    spatialMolecule(
      atoms.map((atom) => ({ ...atom, z: 0 })),
      true,
    ),
  ).toBe(true);
});
