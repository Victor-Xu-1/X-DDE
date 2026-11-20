import { expect, it, vi } from "vitest";
import {
  readPortableSmiles,
  readRecognizedSource,
  recognizedDrawing,
  SmilesHandoffError,
} from "./portable-smiles";

const structure = "2000\nM  V30 BEGIN CTAB\nM  V30 END CTAB\nM  END\n";
const absolute = "N[C@@H](C)C(=O)O";
const relative = "C[C@H](O)[C@H](F)Cl |&1:1,3|";
const generatedMol = "\n     RDKit          2D\n\n  6  5  0  0  0  0  0  0  0  0999 V2000\nM  END\n";

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

it("keeps an unverified or stale source drawing unavailable", async () => {
  const getInChIKey = vi.fn()
    .mockResolvedValueOnce("source-identity")
    .mockResolvedValueOnce("different-drawing");
  const result = { rawSmiles: absolute, smiles: absolute, molfile: generatedMol };
  await expect(readRecognizedSource({ getInChIKey }, result)).resolves.toBeNull();
  await expect(readRecognizedSource({ getInChIKey }, { ...result, rawSmiles: null }))
    .resolves.toBeNull();
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
