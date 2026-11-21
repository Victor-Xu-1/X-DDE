import { expect, it, vi } from "vitest";
import {
  readPortableSmiles,
  readRecognizedSource,
  readRecognizedStereoFile,
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

it.each(["c", "t"])("recovers standard ring stereo %s from a matching recognition result", async (stereo) => {
  const encoded = "O=C1CCCCC=CCCC[C@@H](C)O1 |" + stereo + ":6|";
  const smiles = stereo === "c" ? "C[C@@H]1CCC/C=C\\CCCCC(=O)O1" : "C[C@@H]1CCC/C=C/CCCCC(=O)O1";
  const result = { rawSmiles: smiles, smiles, molfile: generatedMol };
  const source = editor(encoded);
  source.structService.getInChIKey.mockReset().mockResolvedValue("ring-stereo");
  await expect(readPortableSmiles(source, result)).resolves.toBe(smiles);
  await expect(readPortableSmiles(source)).rejects.toThrow(SmilesHandoffError);
});

it("checks ring geometry in the original CXSMILES before using the standard source", async () => {
  const ring = "O=C1CCCCC=CCCC[C@@H](C)O1";
  const rawSmiles = ring + " |(0,0,;1,0,),a:11,t:6|";
  const smiles = "C[C@@H]1CCC/C=C/CCCCC(=O)O1";
  const result = { rawSmiles, smiles, molfile: generatedMol };
  const source = editor(ring + " |t:6|");
  const key = source.structService.getInChIKey;
  key.mockReset().mockImplementation(async (value) => {
    if (value === rawSmiles || value === ring) throw new Error("Stereo ignored");
    return "trans";
  });
  await expect(readPortableSmiles(source, result)).resolves.toBe(smiles);
  expect(key).toHaveBeenCalledWith(ring + " |a:11,t:6|");
  const cis = smiles.replace("/CCCCC", "\\CCCCC");
  key.mockImplementation(async (value) => value === cis ? "cis" : "trans");
  await expect(readPortableSmiles(source, { ...result, smiles: cis }))
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
  expect(key.mock.calls).toEqual([[structure], [editorCx]]);
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
