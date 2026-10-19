import type { GLModel } from "3dmol";
import { parseCifText } from "molstar/lib/mol-io/reader/cif/text/parser";

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
    const rows = parsed.result.blocks[0]?.categories.pdbx_struct_mod_residue;
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
