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
