import { afterAll, expect, it, vi } from "vitest";
const worker = vi.hoisted(() =>
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:confidence-worker"),
);
afterAll(() => worker.mockRestore());
import { GLModel } from "3dmol";
import { mapNativeConfidence } from "./confidence-mapping";
import { confidenceIdentity, type ConfidenceBinding } from "./confidence-types";
const cif = `data_native_predicted_by_opendde
loop_
_atom_site.id
_atom_site.group_PDB
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.auth_seq_id
_atom_site.auth_comp_id
_atom_site.auth_asym_id
_atom_site.auth_atom_id
_atom_site.B_iso_or_equiv
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.pdbx_PDB_model_num
1 ATOM N N . ALA Q 1 . 10 ALA Z N 86.53 0 0 0 1
2 ATOM C CA . ALA Q 1 . 10 ALA Z CA 98 1.4 0 0 1
3 ATOM N N . GLY Q 2 . 12 GLY Z N 70 2.7 0 0 1
4 HETATM C C1 . LIG LC . . 1 LIG K C1 50 0 3 0 1
#
`;
const binding: ConfidenceBinding = {
  protocol: "opendde-cif-row-v1",
  job: "job",
  candidate: "sample-0",
  url: "/api/jobs/job/download?name=native_sample_0.cif",
  structure_sha256: "a".repeat(64),
  confidence_sha256: "b".repeat(64),
  atom_plddt: [0.87, 0.98, 0.7, 0.5],
  atom_to_token_idx: [0, 0, 1, 2],
  token_asym_id: [7, 7, 9],
};
function atoms(text = cif) {
  const model = new GLModel(0);
  model.addMolData(text, "cif");
  return model.selectedAtoms({}).reverse(); // Prove renderer order and serial are not assumed.
}
const source = {
  url: binding.url,
  sha256: binding.structure_sha256,
  text: cif,
};
it("joins native token and atom order to exact renderer identities and preserves every scientific field", async () => {
  const displayed = atoms(),
    before = JSON.stringify(displayed);
  const mapped = await mapNativeConfidence(binding, source, displayed);
  expect(mapped.tokens.map((t) => [t.index, t.chain, t.residue])).toEqual([
    [0, "Z", "Z:ALA:10:"],
    [1, "Z", "Z:GLY:12:"],
    [2, "K", "K:LIG:1:"],
  ]);
  expect(mapped.residueScores["Z:ALA:10:"]).toBe(92.5);
  expect(mapped.atomScores.get(0)).toBe(87);
  expect(mapped.atomTokens.get(3)).toBe(2);
  expect(JSON.stringify(displayed)).toBe(before);
});

it("binds Boltz writer label-atom identities, token scores and individual ligand atoms without an OpenDDE marker", async () => {
  const text = cif
    .replace("data_native_predicted_by_opendde", "data_boltz")
    .replace("_atom_site.auth_atom_id\n", "")
    .split("\n")
    .map((line) => {
      if (!/^\d+ /.test(line)) return line;
      const row = line.split(" ");
      row[6] = row[11];
      if (row[0] === "2") row[13] = "86.53";
      row.splice(12, 1);
      return row.join(" ");
    })
    .join("\n")
    .replace("#\n", "5 HETATM N N1 . LIG K . . 1 LIG K 31 1.4 3 0 1\n#\n");
  const native: ConfidenceBinding = {
    ...binding,
    protocol: "boltz-2.2.1-cif-row-v1",
    atom_plddt: [0.8653, 0.8653, 0.7, 0.5, 0.31],
    atom_to_token_idx: [0, 0, 1, 2, 3],
    token_asym_id: [7, 7, 9, 9],
    native_atom_identity: [
      ["Z", "ALA", 10, "N"],
      ["Z", "ALA", 10, "CA"],
      ["Z", "GLY", 12, "N"],
      ["K", "LIG", 1, "C1"],
      ["K", "LIG", 1, "N1"],
    ],
  };
  const displayed = atoms(text);
  const mapped = await mapNativeConfidence(
    native,
    { ...source, text },
    displayed,
  );
  expect(mapped.atomScores.get(0)).toBeCloseTo(86.53);
  expect(mapped.tokens[2].label).toContain("C1");
  expect(mapped.tokens[3].label).toContain("N1");
  expect(
    [...mapped.atomTokens.values()].filter((index) => index === 2),
  ).toHaveLength(1);
  const wrong = {
    ...native,
    native_atom_identity: native.native_atom_identity!.map(
      (row) => [...row] as typeof row,
    ),
  };
  wrong.native_atom_identity[3][3] = "N1";
  await expect(
    mapNativeConfidence(wrong, { ...source, text }, displayed),
  ).rejects.toThrow("does not match");
  await expect(
    mapNativeConfidence(
      { ...native, atom_plddt: [0.87, 0.87, 0.7, 0.5, 0.31] },
      { ...source, text },
      displayed,
    ),
  ).rejects.toThrow("does not match");
});
it("keeps different samples distinct even when their coordinate bytes are identical", () => {
  expect(confidenceIdentity(binding)).not.toBe(
    confidenceIdentity({ ...binding, candidate: "sample-1" }),
  );
  expect(confidenceIdentity(binding)).not.toBe(
    confidenceIdentity({ ...binding, confidence_sha256: "c".repeat(64) }),
  );
});
it.each([
  { url: "/api/jobs/other/download" },
  { structure_sha256: "c".repeat(64) },
  { confidence_sha256: "unknown" },
  { atom_plddt: [0.5, 0.98, 0.7, 0.5] },
  { atom_to_token_idx: [0, 1, 1, 2] },
  { token_asym_id: [7, 9, 9] },
])(
  "rejects incompatible source/vector identities without substituting B factors (%j)",
  async (change) => {
    await expect(
      mapNativeConfidence({ ...binding, ...change }, source, atoms()),
    ).rejects.toThrow(/Confidence/);
  },
);
it("rejects duplicated/missing atoms, altered coordinates and unsupported insertions rather than assigning by offsets", async () => {
  const displayed = atoms();
  for (const altered of [
    [...displayed, displayed[0]],
    displayed.slice(1),
    displayed.map((a, i) => (i ? a : { ...a, x: 99 })),
  ])
    await expect(
      mapNativeConfidence(binding, source, altered),
    ).rejects.toThrow();
  const insertion = cif.replace("Q 1 . 10", "Q 1 B 10");
  await expect(
    mapNativeConfidence(
      binding,
      { ...source, text: insertion },
      atoms(insertion),
    ),
  ).rejects.toThrow();
});
