import type { GLModel } from "3dmol";
import { parseCifText } from "molstar/lib/mol-io/reader/cif/text/parser";
import type { CifCategory } from "molstar/lib/mol-io/reader/cif/data-model";

const identity = (chain: string, name: string, number: string, code: string) =>
  JSON.stringify([
    chain.trim(),
    name.trim(),
    Number(number),
    ["?", "."].includes(code) ? "" : code.trim(),
  ]);

/** Display classification from deposited metadata; coordinates and chemical identities stay intact. */
export async function retainModifiedPolymer(
  model: GLModel,
  text: string,
  format: string,
  authorResidues = false,
) {
  const modified = new Set<string>();
  if (format === "pdb") {
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith("MODRES"))
        modified.add(
          identity(
            line.slice(16, 17),
            line.slice(12, 15),
            line.slice(18, 22),
            line.slice(22, 23),
          ),
        );
    }
  } else if (format === "cif") {
    const parsed = await parseCifText(text).run();
    if (parsed.isError)
      throw new Error("Modified-polymer source metadata could not be read");
    const categories = parsed.result.blocks[0]?.categories;
    if (authorResidues) retainCifInsertions(model, categories?.atom_site);
    const rows = categories?.pdbx_struct_mod_residue;
    if (rows) {
      const names = [
        "auth_asym_id",
        "auth_comp_id",
        "auth_seq_id",
        "PDB_ins_code",
      ];
      const fields = names.map((name) => rows.getField(name));
      if (fields.some((f) => !f))
        throw new Error("Incomplete modified-polymer source metadata");
      for (let i = 0; i < rows.rowCount; i++)
        modified.add(
          identity(
            fields[0]!.str(i),
            fields[1]!.str(i),
            fields[2]!.str(i),
            fields[3]!.str(i),
          ),
        );
    }
  }
  if (!modified.size) return;
  for (const atom of model.selectedAtoms({})) {
    if (
      modified.has(
        identity(
          atom.chain ?? "",
          atom.resn ?? "",
          String(atom.resi),
          atom.icode ?? "",
        ),
      )
    )
      atom.hetflag = false;
  }
}

function retainCifInsertions(model: GLModel, site?: CifCategory) {
  const insertion = site?.getField("pdbx_PDB_ins_code");
  if (!site || !insertion) return;
  const codeAt = (i: number) => {
    const code = insertion.str(i).trim();
    return code === "." || code === "?" ? "" : code;
  };
  if (!Array.from({ length: site.rowCount }, (_, i) => codeAt(i)).some(Boolean))
    return;

  const chain = site.getField("auth_asym_id"),
    residue = site.getField("auth_seq_id"),
    name = site.getField("auth_comp_id") ?? site.getField("label_comp_id"),
    atomId = site.getField("auth_atom_id") ?? site.getField("label_atom_id");
  const cartesian = ["Cartn_x", "Cartn_y", "Cartn_z"].map((axis) =>
    site.getField(axis),
  );
  const fail = () => {
    throw new Error("Could not verify CIF author residue identities.");
  };
  if (
    !chain ||
    !residue ||
    !name ||
    !atomId ||
    cartesian.some((field) => !field)
  )
    fail();
  const seen = new Set<number>();
  const assignments = model.selectedAtoms({}).map((atom) => {
    // The pinned 3Dmol CIF parser sets serial to the zero-based atom_site row.
    const row = atom.serial;
    if (
      row === undefined ||
      !Number.isInteger(row) ||
      row < 0 ||
      row >= site.rowCount ||
      seen.has(row)
    )
      return fail();
    seen.add(row);
    if (
      atom.chain !== chain!.str(row) ||
      atom.resi !== Number(residue!.str(row)) ||
      atom.resn !== name!.str(row).trim() ||
      atom.atom !== atomId!.str(row).replace(/"/g, "") ||
      cartesian.some((field, n) => {
        const coordinate = Number(field!.str(row));
        const rendered = [atom.x, atom.y, atom.z][n];
        return (
          !Number.isFinite(coordinate) ||
          rendered === undefined ||
          !Number.isFinite(rendered) ||
          Math.abs(coordinate - rendered) > 1e-5
        );
      })
    )
      return fail();
    return { atom, code: codeAt(row) };
  });
  for (let row = 0; row < site.rowCount; row++) {
    if (codeAt(row) && !seen.has(row)) fail();
  }
  for (const { atom, code } of assignments) atom.icode = code;
}
