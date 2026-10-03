import { expect, it, vi, afterAll } from "vitest";
// No worker is executed by this parser test. Isolate only the browser Blob URL boundary.
const objectUrl = vi.hoisted(() =>
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-worker"),
);
afterAll(() => objectUrl.mockRestore());
import { GLModel } from "3dmol";
import { residueRef, residueSelection } from "./geometry";
it("selects actual parsed atoms when the structure omits insertion codes", () => {
  const model = new GLModel(0);
  model.addMolData(
    "ATOM      1  CA  LYS B   8       1.000   2.000   3.000  1.00 50.00           C  \nATOM      2  CB  LYS B   8       2.000   2.000   3.000  1.00 50.00           C  \nEND\n",
    "pdb",
  );
  const atoms = model.selectedAtoms({});
  expect(atoms).toHaveLength(2);
  expect(
    model.selectedAtoms(residueSelection(residueRef(atoms[0]))),
  ).toHaveLength(2);
  expect(
    model.selectedAtoms({ ...residueSelection(residueRef(atoms[0])), resi: 9 }),
  ).toHaveLength(0);
});

it("normalizes blank PDB identity columns while retaining real insertion and alternate codes", async () => {
  const { scientificSelectionIdentity } = await import("./geometry");
  expect(
    scientificSelectionIdentity({
      chain: "A",
      resi: 10,
      icode: " ",
      altLoc: " ",
    }),
  ).toEqual({
    chain: "A",
    number: 10,
    insertion_code: "",
    alternate_location: "",
  });
  expect(
    scientificSelectionIdentity({
      chain: "AB",
      resi: 10,
      icode: " B",
      altLoc: " A",
    }),
  ).toEqual({
    chain: "AB",
    number: 10,
    insertion_code: "B",
    alternate_location: "A",
  });
});

it("uses finite original PDB coordinates and never fabricates zero coordinates", async () => {
  const { finiteCoordinates, atomPosition } = await import("./geometry");
  const model = new GLModel(0);
  model.addMolData(
    "ATOM      1  CA  LYS B   8       1.000   2.000   3.000  1.00 50.00           C  \nEND\n",
    "pdb",
  );
  const atom = model.selectedAtoms({})[0];
  expect(finiteCoordinates(atom)).toEqual([1, 2, 3]);
  expect(atomPosition(atom)).toEqual({ x: 1, y: 2, z: 3 });
  expect(finiteCoordinates({ x: 1, y: NaN, z: 3 })).toBeUndefined();
  expect(() => atomPosition({ x: 1, y: 2 })).toThrow(/finite coordinates/);
});

it("styles real SDF ligands and PDB polymers without inventing residue identities", async () => {
  const { paintOverlayModel } = await import("./style");
  const polymer = new GLModel(0),
    ligand = new GLModel(1);
  polymer.addMolData(
    "ATOM      1  CA  LYS B   8       1.000   2.000   3.000  1.00 50.00           C  \nEND\n",
    "pdb",
  );
  ligand.addMolData(
    "ligand\n  RDKit          3D\n\n  1  0  0  0  0  0  0  0  0  0999 V2000\n    1.0000    2.0000    3.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\nM  END\n$$$$\n",
    "sdf",
  );
  paintOverlayModel(polymer, 0);
  paintOverlayModel(ligand, 1);
  const first = polymer.selectedAtoms({})[0],
    second = ligand.selectedAtoms({})[0];
  expect(first.style?.cartoon).toBeDefined();
  expect(second.style?.stick).toBeDefined();
  expect(second.style?.cartoon).toBeUndefined();
  expect(second.resn).toBeUndefined();
});

it("keeps raw PDB insertion codes while omitting blank column padding from display labels", async () => {
  const { residueLabel } = await import("./protocol");
  const identity = residueRef({
    chain: "A",
    resn: "ASN",
    resi: 140,
    icode: " ",
  });
  expect(identity.icode).toBe(" ");
  expect(residueLabel(identity)).toBe("A:ASN140");
  expect(residueLabel({ ...identity, icode: "B" })).toBe("A:ASN140B");
});
