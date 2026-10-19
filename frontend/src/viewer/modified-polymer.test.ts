import { readFileSync } from "node:fs";
import { GLModel } from "3dmol";
import { describe, expect, it } from "vitest";
import { retainModifiedPolymer } from "./modified-polymer";

describe("deposited modified-polymer display classification", () => {
  it("retains both real STAT6 phosphotyrosines without changing their atoms or coordinates", async () => {
    const source = readFileSync(
      new URL(
        "../../../src/opendde_workbench/examples/stat6/inputs/4Y5U.cif",
        import.meta.url,
      ),
      "utf8",
    );
    const model = new GLModel(0);
    model.addMolData(source, "cif");
    const atoms = model.selectedAtoms({}),
      ptr = atoms.filter((a) => a.resn === "PTR");
    expect(ptr).toHaveLength(32);
    expect(ptr.every((a) => a.hetflag)).toBe(true);
    const immutable = atoms.map((a) => [
      a.serial,
      a.chain,
      a.resi,
      a.icode,
      a.resn,
      a.atom,
      a.elem,
      a.x,
      a.y,
      a.z,
      [...(a.bonds ?? [])],
    ]);
    await retainModifiedPolymer(model, source, "cif");
    expect(ptr.every((a) => a.hetflag === false)).toBe(true);
    expect(
      atoms.map((a) => [
        a.serial,
        a.chain,
        a.resi,
        a.icode,
        a.resn,
        a.atom,
        a.elem,
        a.x,
        a.y,
        a.z,
        [...(a.bonds ?? [])],
      ]),
    ).toEqual(immutable);
  });

  it("uses complete PDB residue identity and never guesses from the component name", async () => {
    const atoms = [
      { chain: "A", resi: 641, resn: "PTR", icode: "", hetflag: true },
      { chain: "B", resi: 641, resn: "PTR", icode: "", hetflag: true },
    ];
    const model = { selectedAtoms: () => atoms } as unknown as GLModel;
    await retainModifiedPolymer(
      model,
      "MODRES XXXX PTR A  641  TYR  PHOSPHOTYROSINE\n",
      "pdb",
    );
    expect(atoms.map((a) => a.hetflag)).toEqual([false, true]);
    await retainModifiedPolymer(model, "", "mol");
    expect(atoms[1].hetflag).toBe(true);
  });

  it("rejects incomplete declared modifications instead of silently treating them as free ligands", async () => {
    const model = new GLModel(0);
    await expect(
      retainModifiedPolymer(
        model,
        "data_test\n_pdbx_struct_mod_residue.auth_comp_id PTR\n",
        "cif",
      ),
    ).rejects.toThrow("Incomplete");
  });
});
