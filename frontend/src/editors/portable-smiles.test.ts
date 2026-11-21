import { expect, it, vi } from "vitest";
import { directionalRingStereoBonds } from "./portable-smiles-ring-stereo";
import {
  readPortableSmiles,
  readRecognizedRingDrawing,
  readRecognizedSource,
  readRecognizedStereoFile,
  recognizedStereoSource,
  recognizedDrawing,
  SmilesHandoffError,
} from "./portable-smiles";

const structure = "2000\nM  V30 BEGIN CTAB\nM  V30 END CTAB\nM  END\n";
const absolute = "N[C@@H](C)C(=O)O";
const relative = "C[C@H](O)[C@H](F)Cl |&1:1,3|";
const generatedMol = "\n     RDKit          2D\n\n  6  5  0  0  0  0  0  0  0  0999 V2000\nM  END\n";
const twoCenters = "C[C@H](O)[C@H](F)Cl";
const partialAbsoluteMol = [
  "", "     RDKit          2D", "",
  "  0  0  0  0  0  0  0  0  0  0999 V3000",
  "M  V30 BEGIN CTAB", "M  V30 COUNTS 6 5 0 0 0",
  "M  V30 BEGIN COLLECTION", "M  V30 MDLV30/STEABS ATOMS=(1 2)",
  "M  V30 END COLLECTION", "M  V30 END CTAB", "M  END", "",
].join("\n");

it.each([
  "FC(Cl)=[C@@]=C(Br)I",
  "[C@](=C(F)Cl)=C(Br)I",
  "FC(Cl)=[C@@](=C(Br)I)",
  "FC(Cl)=[C@@]=C(Br)I.C1.C1",
  "FC(Cl)=[C@@]=C(Br)I.C(C.O)N",
  "FC(Cl)=[C@@]=C(Br)C=1CCCCC=1",
])("retains the original axial marker and atom order for %s", async (rawSmiles) => {
  const result = { rawSmiles, smiles: "FC(Cl)=C=C(Br)I", molfile: generatedMol };
  const source = editor(result.smiles);
  const service = source.structService;
  await expect(readRecognizedSource(service, result)).resolves.toEqual({
    text: rawSmiles, molfile: "", sourceOnly: "allene",
  });
  await expect(readRecognizedStereoFile(service, result, "mol")).rejects.toThrow(SmilesHandoffError);
  await expect(readPortableSmiles(source, result)).rejects.toThrow(SmilesHandoffError);
  expect(service.getInChIKey).not.toHaveBeenCalled();
});

it.each([
  ["FC(Cl)=[C@AL1]=C(Br)I", "FC(Cl)=[C@]=C(Br)I"],
  ["FC(Cl)=[C@AL2]=C(Br)I", "FC(Cl)=[C@@]=C(Br)I"],
  ["FC(Cl)=[C@AL2]=C(I)Br", "FC(Cl)=[C@@]=C(I)Br"],
  ["[C@AL1](=C(F)Cl)=C(Br)I", "[C@](=C(F)Cl)=C(Br)I"],
  ["F[C@H](C)C(Cl)=[13C@AL2:3]=C(Br)I", "F[C@H](C)C(Cl)=[13C@@:3]=C(Br)I"],
])("exports equivalent axial shorthand with the original traversal for %s", async (rawSmiles, text) => {
  const result = { rawSmiles, smiles: "FC(Cl)=C=C(Br)I", molfile: generatedMol };
  const source = editor(result.smiles);
  await expect(readRecognizedSource(source.structService, result))
    .resolves.toEqual({ text, molfile: "", sourceOnly: "allene" });
  await expect(readRecognizedStereoFile(source.structService, result, "mol")).rejects.toThrow(SmilesHandoffError);
  await expect(readPortableSmiles(source, result)).rejects.toThrow(SmilesHandoffError);
  expect(result.rawSmiles).toBe(rawSmiles);
});

it.each([
  "FC(Cl)=[C@AL1]=C(Br)I.C[C@AL2](F)Cl",
  "FC(Cl)=[C@AL1]=C(Br)I.[C@AL3]",
  "FC(Cl)=[C@AL1]=C(Br)I.[Si@AL1](=C(F)Cl)=C(Br)I",
  "F[C@AL1](=C(Br)I)=C(Cl)F",
  "F[C@](=C(Br)I)=C(Cl)F",
  "C=1[C@AL1]=1",
])("withholds unclassified axial notation in %s", (rawSmiles) => {
  expect(recognizedStereoSource({ rawSmiles, smiles: "CC", molfile: generatedMol }))
    .toEqual({ text: "", molfile: "", sourceOnly: "unverified-stereo" });
});

it("withholds ambiguous axial extensions and leaves tetrahedral chlorine intact", () => {
  const result = { smiles: "CC", molfile: generatedMol };
  expect(recognizedStereoSource({
    ...result, rawSmiles: "FC(Cl)=[C@AL1]=C(Br)I |w:1.0|",
  })).toEqual({ text: "", molfile: "", sourceOnly: "allene" });
  expect(recognizedStereoSource({ ...result, rawSmiles: "Cl[C@TH1](F)(Br)I" })).toBeNull();
  expect(recognizedStereoSource({ ...result, rawSmiles: "Cl[C@](F)(Br)I" })).toBeNull();
});

it.each([
  ["@AL1", "@"],
  ["@AL2", "@@"],
])("exports axial %s when the extension contains only planar coordinates", (explicit, short) => {
  const coordinates = "(0,0,;1,1,;2,0,0;3,0,;4,1,;5,1,;6,0,)";
  expect(recognizedStereoSource({
    rawSmiles: `FC(Cl)=[C${explicit}]=C(Br)I |${coordinates}|`,
    smiles: "FC(Cl)=C=C(Br)I", molfile: generatedMol,
  })).toEqual({ text: `FC(Cl)=[C${short}]=C(Br)I`, molfile: "", sourceOnly: "allene" });
});

it.each([
  "(0,0,;1,1,0.5)",
  "(0,0,;1,1,),w:1.0",
  "(0,0,;1,1,),&1:3",
  "(0,0,;1,1,),a:3",
  "(0,0,;1,1,broken)",
])("withholds axial export when the extension is not pure planar coordinates (%s)", (extension) => {
  expect(recognizedStereoSource({
    rawSmiles: `FC(Cl)=[C@AL1]=C(Br)I |${extension}|`,
    smiles: "FC(Cl)=C=C(Br)I", molfile: generatedMol,
  })?.text).toBe("");
});

it.each([
  ["FC(Cl)=[C@AL1]=C(F)[C@TH2H](Br)I", "FC(Cl)=[C@]=C(F)[C@@H](Br)I"],
  ["[13C@TH1](F)(Cl)(Br)C(Cl)=[C@AL2]=C(Br)I", "[13C@](F)(Cl)(Br)C(Cl)=[C@@]=C(Br)I"],
  ["C[P@TH1](=O)(F)C(Cl)=[C@AL2]=C(Br)I", "C[P@](=O)(F)C(Cl)=[C@@]=C(Br)I"],
])("retains both tetrahedral and axial stereo in %s", (rawSmiles, text) => {
  expect(recognizedStereoSource({ rawSmiles, smiles: "CC", molfile: generatedMol }))
    .toEqual({ text, molfile: "", sourceOnly: "allene" });
});

it.each([
  "FC(Cl)=[C@AL1]=C(Br)CC(Cl)=[C@TH1]=C(Br)I",
  "FC(Cl)=[C@AL1]=C(Br)[C@TH1](F)=O",
  "FC(Cl)=[C@AL1]=C(Br)[C@TH1H](F)=O",
  "FC(Cl)=[C@AL1]=C(Br)[C@TH1H2]F",
])("does not reinterpret an inconsistent tetrahedral center in %s", (rawSmiles) => {
  expect(recognizedStereoSource({
    rawSmiles,
    smiles: "CC", molfile: generatedMol,
  })).toEqual({ text: "", molfile: "", sourceOnly: "unverified-stereo" });
});

it("withholds a shorthand recognition when the bond reader cannot classify its stereo", () => {
  const rawSmiles = "FC(Cl)=[C@@]=C(Br)C%(101)CCCCC%(101)";
  expect(recognizedStereoSource({ rawSmiles, smiles: "CC", molfile: generatedMol }))
    .toEqual({ text: "", molfile: "", sourceOnly: "unverified-stereo" });
});

it.each([
  "Cl[Pt@SP1](F)(Br)I",
  "S[As@TB2](F)(Cl)(Br)I",
  "F[Co@OH2](Cl)(Br)(I)(N)O",
])("withholds converted files when the drawing reader cannot verify %s", async (rawSmiles) => {
  const source = editor("CC");
  const result = { rawSmiles, smiles: "CC", molfile: generatedMol };
  await expect(readRecognizedSource(source.structService, result)).resolves.toEqual({
    text: "", molfile: "", sourceOnly: "unverified-stereo",
  });
  await expect(readRecognizedStereoFile(source.structService, result, "sdf")).rejects.toThrow(SmilesHandoffError);
  await expect(readPortableSmiles(source, result)).rejects.toThrow(SmilesHandoffError);
  expect(source.structService.getInChIKey).not.toHaveBeenCalled();
});

it("marks the generated V2000 depiction absolute without changing its other bytes", () => {
  const molfile = generatedMol.replaceAll("\n", "\r\n");
  expect(recognizedDrawing({ smiles: absolute, rawSmiles: absolute, molfile })).toBe(
    molfile.replace("  6  5  0  0  0", "  6  5  0  0  1"),
  );
});

it.each([
  { rawSmiles: relative, smiles: absolute, molfile: generatedMol },
  { rawSmiles: "FC=CCl", smiles: "FC=CCl", molfile: generatedMol },
  { rawSmiles: "F/C=C\\Cl", smiles: "F/C=C\\Cl", molfile: generatedMol },
  { rawSmiles: undefined, smiles: absolute, molfile: generatedMol },
  { rawSmiles: absolute, smiles: absolute, molfile: generatedMol.replace("V2000", "V3000") },
  { rawSmiles: absolute, smiles: absolute, molfile: generatedMol.replace("  6  5  0  0  0", "  6  5  0  0  1") },
])("preserves the depiction without explicit new V2000 absolute stereo", (result) => {
  expect(recognizedDrawing(result)).toBe(result.molfile);
});

it.each(["\n", "\r\n"])("marks ungrouped V3000 centers absolute and retains the collection", (newline) => {
  const molfile = partialAbsoluteMol.replaceAll("\n", newline);
  expect(recognizedDrawing({ rawSmiles: twoCenters + " |a:1|", smiles: twoCenters, molfile }))
    .toBe(molfile.replace("COUNTS 6 5 0 0 0", "COUNTS 6 5 0 0 1"));
});

it.each(["STERAC1", "STEREL1"])("preserves the V3000 flag when a relative collection %s exists", (group) => {
  const molfile = partialAbsoluteMol.replace(
    "M  V30 END COLLECTION",
    `M  V30 MDLV30/${group} ATOMS=(1 4)\nM  V30 END COLLECTION`,
  );
  expect(recognizedDrawing({ rawSmiles: twoCenters + " |a:1|", smiles: twoCenters, molfile }))
    .toBe(molfile);
});

it("keeps recovery and normal export on the same corrected V3000 stereo", async () => {
  const rawSmiles = twoCenters + " |a:1|";
  const result = { rawSmiles, smiles: twoCenters, molfile: partialAbsoluteMol };
  const fixed = partialAbsoluteMol.replace("COUNTS 6 5 0 0 0", "COUNTS 6 5 0 0 1");
  const source = editor(twoCenters, fixed);
  source.structService.getInChIKey.mockReset().mockImplementation(async (value: string) =>
    value === partialAbsoluteMol ? "relative" : "absolute");
  await expect(readPortableSmiles(source, result)).resolves.toBe(twoCenters);
  await expect(readRecognizedSource(source.structService, result)).resolves.toEqual({
    text: twoCenters,
    molfile: fixed,
  });
});

function editor(smiles: string, mol = structure, readback = "same") {
  const key = vi.fn().mockResolvedValueOnce("same").mockResolvedValueOnce(readback);
  return {
    getSmiles: vi.fn().mockResolvedValue(smiles),
    getMolfile: vi.fn().mockResolvedValue(mol),
    structService: { getInChIKey: key },
  };
}

it("exports one clean line while preserving the chirality and verifies the round trip", async () => {
  const source = editor(" \n" + absolute + " \n");
  await expect(readPortableSmiles(source)).resolves.toBe(absolute);
  expect(source.getSmiles).toHaveBeenCalledWith(false);
  expect(source.getMolfile).toHaveBeenCalledWith("v3000");
  expect(source.structService.getInChIKey.mock.calls).toEqual([[structure], [absolute]]);
});

const radicalSmiles = "C[C@@H](C[CH2])O";
const annotatedRadical = radicalSmiles + " |^1:3|";
function radicalKet(index: number, radical: number) {
  return JSON.stringify({
    mol0: { type: "molecule", atoms: Array.from({length: 5}, (_, i) => ({radical: i === index ? radical : 0})) },
  });
}

it("exports a chiral radical when the bracket atom restores the same annotation", async () => {
  const source = editor(annotatedRadical);
  source.structService.getInChIKey.mockResolvedValue("same");
  const read = vi.fn(async (input: string) =>
    input === structure ? annotatedRadical : radicalKet(3, 2));
  await expect(readPortableSmiles(source, undefined, read)).resolves.toBe(radicalSmiles);
  expect(read.mock.calls).toEqual([[structure], [radicalSmiles, "ket"]]);
});

it.each([
  ["different spin", annotatedRadical, radicalKet(3, 1)],
  ["different atom", annotatedRadical, radicalKet(2, 2)],
  ["missing from the drawing", radicalSmiles, radicalKet(3, 2)],
  ["missing on read-back", annotatedRadical, radicalKet(3, 0)],
])("requires MOL if the radical is %s despite a matching InChIKey", async (_, molText, plainText) => {
  const source = editor(annotatedRadical);
  source.structService.getInChIKey.mockResolvedValue("same");
  const read = vi.fn(async (input: string) =>
    input === structure ? molText : plainText);
  await expect(readPortableSmiles(source, undefined, read)).rejects.toThrow(SmilesHandoffError);
});

it("withholds all converted exports for an unverified explicit spin assignment", async () => {
  const result = {rawSmiles: "C[C@H](O)C[CH2] |^3:4|", smiles: radicalSmiles, molfile: structure};
  expect(recognizedStereoSource(result)).toEqual({text: "", molfile: "", sourceOnly: "unverified-stereo"});
  await expect(readPortableSmiles(editor(radicalSmiles), result)).rejects.toThrow(SmilesHandoffError);
  const getInChIKey = vi.fn().mockResolvedValue("same");
  const service = {getInChIKey};
  await expect(readRecognizedStereoFile(service, result, "mol")).rejects.toThrow(SmilesHandoffError);
  await expect(readRecognizedStereoFile(service, result, "sdf")).rejects.toThrow(SmilesHandoffError);
  expect(getInChIKey).not.toHaveBeenCalled();
});

it("requires a structure file if the drawing declares spin beyond the plain bracket atom", async () => {
  const singlet = annotatedRadical.replace("^1", "^3");
  const read = vi.fn(async (input: string) => input === structure ? singlet : radicalKet(3, 2));
  const source = editor(singlet);
  source.structService.getInChIKey.mockResolvedValue("same");
  await expect(readPortableSmiles(source, undefined, read)).rejects.toThrow(SmilesHandoffError);
  expect(read.mock.calls).toEqual([[structure]]);
});

it("requires a structure file when a writer drops the drawing's radical annotation", async () => {
  const mol = structure.replace("M  V30 END CTAB", "M  V30 4 C 0 0 0 0 RAD=3\nM  V30 END CTAB");
  await expect(readPortableSmiles(editor(radicalSmiles, mol))).rejects.toThrow(SmilesHandoffError);
});

it.each(["M  RAD  1   4   1", "M  V30 4 C 0 0 0 0 RAD=1"])(
  "withholds a rejected radical drawing even if its InChIKey would match (%s)",
  async (record) => {
    const getInChIKey = vi.fn().mockResolvedValue("same");
    const result = { rawSmiles: radicalSmiles, smiles: radicalSmiles, molfile: `${record}\nM  END\n` };
    await expect(readRecognizedSource({ getInChIKey }, result)).resolves.toBeNull();
    expect(getInChIKey).not.toHaveBeenCalled();
  },
);

it.each([
  [relative, structure],
  [absolute, structure + "M  V30 MDLV30/STERAC1 ATOMS=(2 2 4)\n"],
  [absolute, structure + "M  V30 MDLV30/STEREL1 ATOMS=(2 2 4)\n"],
])("requires a structure file when ordinary SMILES cannot carry its stereo group", async (smiles, mol) => {
  const source = editor(smiles, mol);
  await expect(readPortableSmiles(source)).rejects.toThrow(SmilesHandoffError);
  expect(source.structService.getInChIKey).not.toHaveBeenCalled();
});

it.each(["", "C Molecule", "C\nC", "CC>>CO", "CCＯ"])(
  "keeps invalid or multi-field SMILES off the clipboard",
  async (smiles) => {
    await expect(readPortableSmiles(editor(smiles))).rejects.toThrow(SmilesHandoffError);
  },
);

it("keeps a nonmatching structure or stereo assignment off the clipboard", async () => {
  await expect(readPortableSmiles(editor(absolute, structure, "changed"))).rejects.toThrow(
    SmilesHandoffError,
  );
});

it("reports a conversion failure as a structure export error", async () => {
  const source = editor(absolute);
  source.getSmiles.mockRejectedValueOnce(new Error("Convert failed"));
  await expect(readPortableSmiles(source)).rejects.toThrow(SmilesHandoffError);
});

it("recovers a verified source with known chirality and unspecified double bond stereo", async () => {
  const rawSmiles = "C[C@H](O)CC=CC(Cl)F";
  const smiles = "C[C@H](O)CC=CC(F)Cl";
  const result = { rawSmiles, smiles, molfile: generatedMol };
  const getInChIKey = vi.fn().mockResolvedValue("source-identity");

  const file = recognizedDrawing(result);
  await expect(readRecognizedSource({ getInChIKey }, result)).resolves.toEqual({
    text: smiles,
    molfile: file,
  });
  expect(getInChIKey.mock.calls).toEqual([[rawSmiles], [file], [smiles]]);
});

it("recovers only the structure file when the source has an enhanced stereo group", async () => {
  const molfile = structure + "M  V30 MDLV30/STERAC1 ATOMS=(2 2 4)\n";
  const getInChIKey = vi.fn().mockResolvedValue("relative-identity");
  const result = { rawSmiles: relative, smiles: "C[C@H](O)[C@H](F)Cl", molfile };
  await expect(readRecognizedSource({ getInChIKey }, result)).resolves.toEqual({
    text: "",
    molfile,
  });
  expect(getInChIKey.mock.calls).toEqual([[relative], [molfile]]);
});

const ringBody = "O=C1CCCCC=CCCC[C@@H](C)O1";
const ringResult = {
  rawSmiles: ringBody + " |(0,0,;1,0,),t:6,a:11|",
  smiles: "C[C@H]1OC(=O)CCCCC=CCCC1",
  molfile: generatedMol,
};
const ringDeclared = ringBody + " |t:6,a:11|";
const ringStandard = "O=C1CCCC\\C=C\\CCC[C@@H](C)O1";

it.each([
  [ringStandard, true],
  ["C/C1=C/CCCCCC1", true],
  ["C1CCC/C=C/CC1.C/C=C/C", true],
  ["C/C=C/c1ccccc1", false],
  ["C1CC=CCC1.C/C=C/C", false],
  ["C/C=C/C", false],
])("identifies directional syntax on a ring bond in %s", (text, ring) => {
  expect(Boolean(directionalRingStereoBonds(text).length)).toBe(ring);
});

function ringRecovery({
  normalizedKey = "unassigned", drawingKey = "unassigned",
  unspecifiedKey = "unassigned",
  readBack = "O=C1O[C@H](C)CCCC=CCCCC1 |t:8|",
} = {}) {
  const keys = new Map([
    [ringDeclared, "trans"], [ringStandard, "trans"], [ringBody + " |a:11|", unspecifiedKey],
    [ringResult.smiles, normalizedKey], [recognizedDrawing(ringResult), drawingKey],
    [structure, drawingKey],
  ]);
  const getInChIKey = vi.fn(async (input: string) => keys.get(input) ?? "");
  const read = vi.fn(async (input: string) =>
    input === ringDeclared ? "O=C1O[C@H](C)CCCC=CCCCC1 |t:8|" : readBack,
  );
  return { service: { getInChIKey }, read };
}

it("recovers plain ring geometry and absolute stereo from a planar source", async () => {
  const { service, read } = ringRecovery();
  await expect(readRecognizedSource(service, ringResult, read)).resolves.toEqual({
    text: ringStandard, molfile: "",
  });
  expect(read.mock.calls).toEqual([[ringDeclared], [ringStandard]]);
  await expect(readRecognizedStereoFile(service, ringResult, "mol"))
    .rejects.toThrow(SmilesHandoffError);
});

it.each([
  { drawingKey: "different molecule" },
  { normalizedKey: "cis" },
  { unspecifiedKey: "trans", drawingKey: "trans", normalizedKey: "trans" },
  { readBack: "O=C1O[C@H](C)CCCC=CCCCC1 |c:8|" },
  { readBack: "O=C1O[C@@H](C)CCCC=CCCCC1 |t:8|" },
  { readBack: "O=C1O[C@H](C)CCCC=CCCCC1" },
])("withholds source recovery when the original stereo cannot be corroborated (%j)", async (keys) => {
  const { service, read } = ringRecovery(keys);
  await expect(readRecognizedSource(service, ringResult, read)).resolves.toBeNull();
});

it("keeps both exports when the native MOL retains the original ring geometry", async () => {
  const { service, read } = ringRecovery({ drawingKey: "trans" });
  await expect(readRecognizedSource(service, ringResult, read)).resolves.toEqual({
    text: ringStandard, molfile: recognizedDrawing(ringResult),
  });
});

it("offers verified text but withholds a loadable drawing that omits ring geometry", async () => {
  const { service, read } = ringRecovery();
  const canvas = { ...editor(ringBody), structService: service };
  await expect(readRecognizedRingDrawing(canvas, ringResult, read))
    .resolves.toEqual({ text: ringStandard, molfile: "" });
  await expect(readPortableSmiles(canvas, ringResult, read)).resolves.toBe(ringStandard);
});

it("passes equivalent directional input through the same native ring verification", async () => {
  const { service } = ringRecovery();
  const read = vi.fn(async () => ringDeclared);
  const result = { ...ringResult, rawSmiles: ringStandard };
  const canvas = { ...editor(ringBody), structService: service };
  await expect(readRecognizedRingDrawing(canvas, result, read))
    .resolves.toEqual({ text: ringStandard, molfile: "" });
});

it("withholds a directional source if native conversion drops one of its ring declarations", async () => {
  const { service } = ringRecovery();
  const rawSmiles = ringStandard + ".C1CC/C=C/CC1";
  expect(directionalRingStereoBonds(rawSmiles)).toHaveLength(2);
  const read = vi.fn(async () => ringDeclared);
  await expect(readRecognizedSource(service, { ...ringResult, rawSmiles }, read))
    .resolves.toBeNull();
  expect(read).toHaveBeenCalledExactlyOnceWith(rawSmiles);
  expect(service.getInChIKey).not.toHaveBeenCalled();
});

it("rejects a partly represented declaration even when other rings distinguish its key", async () => {
  const { service, read } = ringRecovery();
  const rawSmiles = ringResult.rawSmiles.replace("t:6", "t:6,8");
  service.getInChIKey.mockImplementation(async (value) =>
    value === ringBody + " |t:6,8,a:11|" || value === ringBody + " |a:11,t:6|"
      ? "trans" : "unassigned");
  await expect(readRecognizedSource(service, { ...ringResult, rawSmiles }, read))
    .resolves.toBeNull();
  expect(read).not.toHaveBeenCalled();
});

it("keeps an unverified or stale source drawing unavailable", async () => {
  const getInChIKey = vi.fn()
    .mockResolvedValueOnce("source-identity")
    .mockResolvedValueOnce("different-drawing");
  const result = { rawSmiles: absolute, smiles: absolute, molfile: generatedMol };
  await expect(readRecognizedSource({ getInChIKey }, result)).resolves.toBeNull();
  await expect(readRecognizedSource({ getInChIKey }, { ...result, rawSmiles: null }))
    .resolves.toBeNull();
});

const quinine = {
  rawSmiles: "COc1ccc2nccc([C@@H](O)[C@@H]3C[C@@H]4CCN3C[C@@H]4C=C)c2c1",
  smiles: "C=C[C@H]1CN2CC[C@H]1C[C@H]2[C@H](O)c1ccnc2ccc(OC)cc12",
  molfile: generatedMol,
};
const rebuiltMol = generatedMol.replace("RDKit", "Indigo");
const inspectedDrawing = '{"root":{"nodes":[]}}';

function absoluteDrawingRecovery(conflict?: "layout" | "normalized" | "regenerated") {
  const getInChIKey = vi.fn(async (input: string) => {
    if (input === recognizedDrawing(quinine)) return "different stereo after chiral flag";
    if (conflict === "layout" && input === inspectedDrawing ||
        conflict === "normalized" && input === quinine.smiles ||
        conflict === "regenerated" && input === recognizedDrawing({ ...quinine, molfile: rebuiltMol }))
      return "different stereo";
    return "source identity";
  });
  const layout = vi.fn(async ({ output_format }: { output_format: string }) => ({
    struct: output_format === "chemical/x-indigo-ket" ? inspectedDrawing : rebuiltMol,
  }));
  return { getInChIKey, layout };
}

it("regenerates a recognized absolute drawing after the chiral flag changes its identity", async () => {
  const service = absoluteDrawingRecovery();
  await expect(readRecognizedSource(service, quinine)).resolves.toEqual({
    text: quinine.smiles,
    molfile: recognizedDrawing({ ...quinine, molfile: rebuiltMol }),
  });
  expect(service.layout).toHaveBeenNthCalledWith(1, {
    struct: recognizedDrawing(quinine), output_format: "chemical/x-indigo-ket",
  });
  expect(service.layout).toHaveBeenNthCalledWith(2, {
    struct: quinine.smiles, output_format: "chemical/x-mdl-molfile",
  });
  expect(service.getInChIKey).toHaveBeenCalledWith(inspectedDrawing);
});

it.each(["layout", "normalized", "regenerated"] as const)(
  "withholds absolute recovery if the %s structure conflicts with the recognition source",
  async (conflict) => {
    const service = absoluteDrawingRecovery(conflict);
    await expect(readRecognizedSource(service, quinine)).resolves.toBeNull();
    expect(service.layout).toHaveBeenCalledTimes({ normalized: 0, layout: 1, regenerated: 2 }[conflict]);
  },
);

it("does not replace a current drawing with an absolute source recovery", async () => {
  const service = absoluteDrawingRecovery();
  await expect(readRecognizedSource(service, quinine, undefined, recognizedDrawing(quinine)))
    .resolves.toBeNull();
  expect(service.layout).not.toHaveBeenCalled();
});

it("does not publish normalized SMILES that differ from the recognized stereochemistry", async () => {
  const getInChIKey = vi.fn().mockResolvedValueOnce("source-identity")
    .mockResolvedValueOnce("source-identity").mockResolvedValueOnce("opposite");
  const result = {
    rawSmiles: absolute,
    smiles: absolute.replace("@@", "@"),
    molfile: generatedMol,
  };
  await expect(readRecognizedSource({ getInChIKey }, result)).resolves.toEqual({
    text: "",
    molfile: recognizedDrawing(result),
  });
});

it("keeps a verified MOL available when the plain-text reader rejects the SMILES", async () => {
  const getInChIKey = vi.fn()
    .mockResolvedValueOnce("source-identity")
    .mockResolvedValueOnce("source-identity")
    .mockRejectedValueOnce(new Error("Unsupported SMILES"));
  const result = { rawSmiles: absolute, smiles: absolute, molfile: generatedMol };
  await expect(readRecognizedSource({ getInChIKey }, result)).resolves.toEqual({
    text: "",
    molfile: recognizedDrawing(result),
  });
});

it("recovers ordinary text from the same recognized absolute CX group", async () => {
  const rawSmiles = absolute + " |a:1|";
  const result = { rawSmiles, smiles: absolute, molfile: generatedMol };
  const getInChIKey = vi.fn().mockResolvedValue("absolute-identity");
  await expect(readRecognizedSource({ getInChIKey }, result)).resolves.toEqual({
    text: absolute,
    molfile: recognizedDrawing(result),
  });
  expect(getInChIKey.mock.calls).toEqual([
    [rawSmiles], [recognizedDrawing(result)], [absolute],
  ]);
});

it("exports verified 2D-coordinate CXSMILES as one portable line", async () => {
  const rawSmiles = absolute + " |(-1.2,.3,;0,0,0;1.2,0,;2,0,;3,0,;4,0,)|";
  const result = { rawSmiles, smiles: absolute, molfile: generatedMol };
  const molfile = recognizedDrawing(result);
  expect(molfile).toContain("  6  5  0  0  1");
  const getInChIKey = vi.fn(async (value: string) => {
    if (value === rawSmiles) throw new Error("Indigo cannot interpret the drawing coordinates");
    return "absolute-identity";
  });
  await expect(readRecognizedSource({ getInChIKey }, result)).resolves.toEqual({
    text: absolute,
    molfile,
  });
  expect(getInChIKey).not.toHaveBeenCalledWith(rawSmiles);
  const source = editor(rawSmiles);
  source.structService.getInChIKey.mockReset().mockImplementation(getInChIKey);
  await expect(readPortableSmiles(source, result)).resolves.toBe(absolute);
  source.structService.getInChIKey.mockImplementation(async (value) =>
    value === structure ? "different-stereo" : "absolute-identity");
  await expect(readPortableSmiles(source, result)).rejects.toThrow("无法核对");
});

it("verifies combined planar coordinates and absolute stereo without flattening the marker", async () => {
  const rawSmiles = absolute + " |(0,0,;1,0,;2,0,;3,0,;4,0,;5,0,),a:1|";
  const result = { rawSmiles, smiles: absolute, molfile: generatedMol };
  const source = editor(rawSmiles);
  const getInChIKey = source.structService.getInChIKey;
  getInChIKey.mockReset().mockImplementation(async (value) => {
    if (value === rawSmiles) throw new Error("Degenerate coordinates");
    return "verified";
  });
  await expect(readPortableSmiles(source, result)).resolves.toBe(absolute);
  await expect(readRecognizedSource(source.structService, result)).resolves.toEqual({
    text: absolute,
    molfile: recognizedDrawing(result),
  });
  expect(recognizedDrawing(result)).toContain("  6  5  0  0  1");
  expect(getInChIKey).toHaveBeenCalledWith(absolute + " |a:1|");
  expect(getInChIKey).not.toHaveBeenCalledWith(rawSmiles);
});

it.each(["(0,0,1)", "(0,0,),o1:1", "(0,0,),w:1.0", "(a,0,)", "(0,0,);(1,0,)"])(
  "keeps unrecognized, mixed or spatial CX annotations %s out of plain export",
  async (annotation) => {
    const result = {
      rawSmiles: absolute + " |" + annotation + "|",
      smiles: absolute,
      molfile: generatedMol,
    };
    const getInChIKey = vi.fn().mockResolvedValue("absolute-identity");
    await expect(readRecognizedSource({ getInChIKey }, result)).resolves.toEqual({
      text: "",
      molfile: generatedMol,
    });
    await expect(readPortableSmiles(editor(absolute), result)).rejects.toThrow("扩展注释");
  },
);

it("rejects a portable editor export if the recognized original has different stereo", async () => {
  const other = absolute.replace("@@", "@");
  const source = editor(other, structure);
  source.structService.getInChIKey.mockReset()
    .mockImplementation(async (value) => value === absolute ? "original" : "opposite");
  await expect(readPortableSmiles(source, {
    rawSmiles: absolute,
    smiles: absolute,
    molfile: generatedMol,
  })).rejects.toThrow("无法核对");
  // An actual edit has a new revision and must export its own current stereo.
  await expect(readPortableSmiles(source)).resolves.toBe(other);
});

it("rejects an absolute-only extension when the plain output loses stereo", async () => {
  const withoutMarks = "NC(C)C(=O)O";
  const source = editor(withoutMarks + " |a:1|");
  source.structService.getInChIKey.mockReset()
    .mockImplementation(async (value) => value === withoutMarks ? "unspecified" : "specified");
  await expect(readPortableSmiles(source)).rejects.toThrow("无法核对");
});

it.each(["c", "t"])("uses standard ring stereo %s when no source annotation needs recovery", async (stereo) => {
  const encoded = "O=C1CCCCC=CCCC[C@@H](C)O1 |" + stereo + ":6|";
  const smiles = stereo === "c" ? "C[C@@H]1CCC/C=C\\CCCCC(=O)O1" : "C[C@@H]1CCC/C=C/CCCCC(=O)O1";
  const result = { smiles, molfile: generatedMol };
  const source = editor(encoded);
  source.structService.getInChIKey.mockReset().mockResolvedValue("ring-stereo");
  await expect(readPortableSmiles(source, result)).rejects.toThrow(SmilesHandoffError);
  const read = vi.fn(async () => encoded);
  const expected = "O=C1CCCC\\C=C" + (stereo === "c" ? "/" : "\\") + "CCC[C@@H](C)O1";
  await expect(readPortableSmiles(source, result, read)).resolves.toBe(expected);
  await expect(readPortableSmiles(source)).rejects.toThrow(SmilesHandoffError);
});

it("checks ring geometry in the original CXSMILES before using the standard source", async () => {
  const { service, read } = ringRecovery({ drawingKey: "trans" });
  const source = { ...editor(ringBody + " |t:6|"), structService: service };
  await expect(readPortableSmiles(source, ringResult, read)).resolves.toBe(ringStandard);
  expect(service.getInChIKey).toHaveBeenCalledWith(ringDeclared);
  const bad = ringRecovery({ drawingKey: "trans", normalizedKey: "cis" });
  await expect(readPortableSmiles({ ...source, structService: bad.service }, ringResult, bad.read))
    .rejects.toThrow(SmilesHandoffError);
});

it("rejects a recognized ring isomer that differs from the current drawing", async () => {
  const smiles = "C[C@@H]1CCC/C=C/CCCCC(=O)O1";
  const source = editor("O=C1CCCCC=CCCC[C@@H](C)O1 |c:6|");
  source.structService.getInChIKey.mockReset()
    .mockImplementation(async (value) => value === structure ? "cis" : "trans");
  await expect(readPortableSmiles(source, { rawSmiles: smiles, smiles, molfile: generatedMol }))
    .rejects.toThrow(SmilesHandoffError);
});

it.each(["c", "t"])("exports edited absolute stereochemistry and ring geometry %s without an OCR fallback", async (stereo) => {
  const base = "CC[C@H]1OC(=O)CCCCC=CCCC1";
  const annotated = base + " |" + stereo + ":10|";
  const expected = "CC[C@H]1OC(=O)CCCC\\C=C" + (stereo === "c" ? "/" : "\\") + "CCC1";
  const source = editor(annotated);
  source.structService.getInChIKey.mockReset().mockResolvedValue("edited-structure");
  const readSmiles = vi.fn(async (value: string) => value === expected ? annotated : value);

  await expect(readPortableSmiles(source, undefined, readSmiles)).resolves.toBe(expected);
  expect(readSmiles.mock.calls).toEqual([[annotated], [expected]]);
  expect(source.structService.getInChIKey).toHaveBeenCalledWith(expected);
});

it.each(["opposite", "discarded"])("blocks edited SMILES when the readback gives %s ring geometry", async (failure) => {
  const base = "CC[C@H]1OC(=O)CCCCC=CCCC1";
  const annotated = base + " |t:10|";
  const source = editor(annotated);
  source.structService.getInChIKey.mockReset().mockResolvedValue("same-key");
  const readSmiles = vi.fn(async (value: string) => failure === "discarded"
    ? base
    : value === annotated ? annotated : base + " |c:10|");

  await expect(readPortableSmiles(source, undefined, readSmiles)).rejects.toThrow(SmilesHandoffError);
});

it("rejects a ring annotation that disagrees with the editor's MOL and recognition", async () => {
  const smiles = "C[C@@H]1CCC/C=C/CCCCC(=O)O1";
  const editorCx = "O=C1CCCCC=CCCC[C@@H](C)O1 |c:6|";
  const source = editor(editorCx);
  const key = source.structService.getInChIKey;
  key.mockReset().mockImplementation(async (value) => value === editorCx ? "cis" : "trans");
  await expect(readPortableSmiles(source, { rawSmiles: smiles, smiles, molfile: generatedMol }))
    .rejects.toThrow(SmilesHandoffError);
  expect(key.mock.calls).toEqual([]);
});

it("does not flatten a recognized stereo group missing from the editor export", async () => {
  const source = editor(absolute);
  await expect(readPortableSmiles(source, {
    rawSmiles: relative,
    smiles: absolute,
    molfile: structure + "M  V30 MDLV30/STEREL1 ATOMS=(2 2 4)\n",
  })).rejects.toThrow(SmilesHandoffError);
  expect(source.structService.getInChIKey).not.toHaveBeenCalled();
});

it("stops enhanced-stereo file export when the original cannot be verified", async () => {
  const result = {
    rawSmiles: relative,
    smiles: absolute,
    molfile: structure + "M  V30 MDLV30/STERAC1 ATOMS=(2 2 4)\n",
  };
  const source = editor(absolute, structure, "inconsistent");
  await expect(readRecognizedStereoFile(source.structService, result, "mol"))
    .rejects.toThrow("无法核对原始立体化学");
  expect(source.getMolfile).not.toHaveBeenCalled();
  const getInChIKey = vi.fn().mockResolvedValue("original");
  await expect(readRecognizedStereoFile({ getInChIKey }, result, "sdf"))
    .resolves.toBe(result.molfile.trimEnd() + "\n$$$$\n");
});

it.each(["t:6,o1:3,5", "t:6,w:3.3", "t:6,$label$"])(
  "keeps additional stereo or annotation %s in the structure file",
  async (extension) => {
    const source = editor("O=C1CCCCC=CCCC[C@@H](C)O1 |" + extension + "|");
    await expect(readPortableSmiles(source, {
      rawSmiles: absolute, smiles: absolute, molfile: generatedMol,
    })).rejects.toThrow(SmilesHandoffError);
    expect(source.structService.getInChIKey).not.toHaveBeenCalled();
  },
);
