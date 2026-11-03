import type { AtomSpec } from "3dmol";
import { parseCifText } from "molstar/lib/mol-io/reader/cif/text/parser";
import { residueRef } from "./geometry";
import { residueLabel } from "./protocol";
import {
  confidenceIdentity,
  type ConfidenceBinding,
  type ConfidenceInspection,
  type ConfidenceToken,
} from "./confidence-types";

export interface MappedConfidence extends ConfidenceInspection {
  atomScores: Map<number, number>;
  atomTokens: Map<number, number>;
}
const clean = (value: string) =>
  [".", "?"].includes(value) ? "" : value.trim();
const fail = () => {
  throw new Error("Confidence does not match this native structure.");
};

/** The reviewed dumper writes the full AtomArray in CIF row order (no output mask).
 * Resolve every row to renderer atoms by identity AND coordinates. No serial/chain offsets.
 * Unsupported alternate/model/insertion records fail closed rather than guessing parser identities.
 */
export async function mapNativeConfidence(
  binding: ConfidenceBinding,
  source: { url: string; sha256: string; text: string },
  atoms: AtomSpec[],
): Promise<MappedConfidence> {
  if (
    binding.protocol !== "opendde-cif-row-v1" ||
    binding.url !== source.url ||
    binding.structure_sha256 !== source.sha256 ||
    !/^[a-f0-9]{64}$/.test(binding.confidence_sha256) ||
    !/^[a-f0-9]{64}$/.test(source.sha256) ||
    !source.text.slice(0, 512).includes("_predicted_by_opendde")
  )
    fail();
  const scores = binding.atom_plddt,
    links = binding.atom_to_token_idx,
    chains = binding.token_asym_id;
  if (
    !Array.isArray(scores) ||
    !scores.length ||
    scores.length > 100000 ||
    scores.length !== atoms.length ||
    links?.length !== scores.length ||
    !chains?.length ||
    chains.length > 10000 ||
    scores.some((v) => !Number.isFinite(v) || v < 0 || v > 1) ||
    links.some(
      (v) => !Number.isSafeInteger(v) || v < 0 || v >= chains.length,
    ) ||
    chains.some((v) => !Number.isSafeInteger(v) || v < 0)
  )
    fail();
  const parsed = await parseCifText(source.text).run();
  if (parsed.isError || parsed.result.blocks.length !== 1) return fail();
  const site = parsed.result.blocks[0].categories.atom_site;
  if (!site || site.rowCount !== scores.length) return fail();
  const read = (name: string, i: number, required = true) => {
    const field = site.getField(name);
    if (!field && required) return fail();
    return clean(field?.str(i) ?? "");
  };
  const renderer = new Map<string, AtomSpec>();
  const identity = (chain: string, resn: string, resi: number, atom: string) =>
    JSON.stringify([chain, resn, resi, atom]);
  for (const atom of atoms) {
    const key = identity(
      atom.chain ?? "",
      atom.resn ?? "",
      atom.resi!,
      atom.atom ?? "",
    );
    if (renderer.has(key) || !Number.isInteger(atom.index)) return fail();
    renderer.set(key, atom);
  }
  const atomScores = new Map<number, number>(),
    atomTokens = new Map<number, number>(),
    residueValues = new Map<string, number[]>();
  const tokens = new Map<number, ConfidenceToken>(),
    asymToChain = new Map<number, string>(),
    chainToAsym = new Map<string, number>();
  for (let i = 0; i < site.rowCount; i++) {
    if (
      read("label_alt_id", i, false) ||
      read("pdbx_PDB_ins_code", i, false) ||
      !["", "1"].includes(read("pdbx_PDB_model_num", i, false))
    )
      return fail();
    const chain = read("auth_asym_id", i),
      resn = read("auth_comp_id", i),
      resi = Number(read("auth_seq_id", i));
    const atom = renderer.get(
      identity(chain, resn, resi, read("auth_atom_id", i)),
    );
    if (!atom || atomScores.has(atom.index!)) return fail();
    const coordinates = ["Cartn_x", "Cartn_y", "Cartn_z"].map((f) =>
      Number(read(f, i)),
    );
    if (
      coordinates.some(
        (v, j) =>
          !Number.isFinite(v) ||
          Math.abs(v - [atom.x!, atom.y!, atom.z!][j]) > 1e-5,
      )
    )
      return fail();
    const b = Number(read("B_iso_or_equiv", i));
    // Native JSON is rounded to two decimal fractions; CIF retains hundredths of a percent.
    // This is corroboration of the proven writer order, never the source of confidence.
    if (!Number.isFinite(b) || Math.abs(b - scores[i] * 100) > 0.511)
      return fail();
    const residue = residueRef(atom),
      token = links[i],
      asym = chains[token],
      labelChain = read("label_asym_id", i);
    if (
      (asymToChain.has(asym) && asymToChain.get(asym) !== labelChain) ||
      (chainToAsym.has(labelChain) && chainToAsym.get(labelChain) !== asym)
    )
      return fail();
    asymToChain.set(asym, labelChain);
    chainToAsym.set(labelChain, asym);
    const old = tokens.get(token);
    if (old && old.residue !== residue.key) return fail();
    tokens.set(token, {
      index: token,
      chain,
      residue: residue.key,
      label: residueLabel(residue),
    });
    atomScores.set(atom.index!, scores[i] * 100);
    atomTokens.set(atom.index!, token);
    const values = residueValues.get(residue.key) ?? [];
    values.push(scores[i] * 100);
    residueValues.set(residue.key, values);
  }
  if (tokens.size !== chains.length) return fail();
  return {
    key: confidenceIdentity(binding),
    atomScores,
    atomTokens,
    residueScores: Object.fromEntries(
      [...residueValues].map(([key, values]) => [
        key,
        values.reduce((a, b) => a + b, 0) / values.length,
      ]),
    ),
    tokens: [...tokens.values()].sort((a, b) => a.index - b.index),
  };
}
