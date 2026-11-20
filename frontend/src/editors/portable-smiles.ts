type StructureExport = {
  getSmiles(isExtended?: boolean): Promise<string>;
  getMolfile(format: "v3000"): Promise<string>;
  structService: {
    getInChIKey(structure: string): Promise<string>;
  };
};

export type RecognitionResult = {
  rawSmiles?: string | null;
  smiles: string;
  molfile: string;
};

export type RecognizedSourceExport = {
  text: string;
  molfile: string;
};

export class SmilesHandoffError extends Error {}

/** Indigo can return CXSMILES even from getSmiles(false). */
export function hasSmilesExtension(value: string) {
  return value.includes("|");
}

function isPortableLine(value: string) {
  return /^[\x21-\x7e]+$/.test(value) && !/[>|]/.test(value);
}

const coordinateNumber = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function isPlanarCoordinateList(value: string) {
  if (!value.startsWith("(") || !value.endsWith(")")) return false;
  return value.slice(1, -1).split(";").every((point) => {
    const [x, y, z, ...rest] = point.split(",");
    return rest.length === 0 && coordinateNumber.test(x) &&
      coordinateNumber.test(y) && Number.isFinite(Number(x)) &&
      Number.isFinite(Number(y)) &&
      (z === "" || (coordinateNumber.test(z) && Number(z) === 0));
  });
}

/** Remove only drawing coordinates and redundant absolute stereo labels. */
function plainStereoSmiles(value: string) {
  if (isPortableLine(value)) return value;
  const match = /^(\S+) \|([^|]+)\|$/.exec(value);
  if (!match || !isPortableLine(match[1])) return null;
  const [, text, annotation] = match;
  const absolute = /^a:\d+(?:,\d+)*$/.test(annotation);
  return absolute || isPlanarCoordinateList(annotation) ? text : null;
}

function identityInput(value: string) {
  // Indigo can infer stereo or fail on degenerate CX drawing coordinates.
  // Check the 2D depiction separately against the coordinate-free graph.
  return value.includes(" |(") ? plainStereoSmiles(value) ?? value : value;
}

function hasOnlyRingAndAbsoluteStereo(value: string) {
  return /^\S+ \|(?:[act]:\d+(?:,\d+)*)(?:,[act]:\d+(?:,\d+)*)*\|$/.test(value);
}

/** Repair the generated V2000 depiction using the same OCR result's stereo. */
export function recognizedDrawing({ rawSmiles, smiles, molfile }: RecognitionResult) {
  if (!rawSmiles || rawSmiles.length > 100_000) return molfile;
  const raw = plainStereoSmiles(rawSmiles.trim());
  if (!raw?.includes("@") || !smiles.includes("@"))
    return molfile;

  // RDKit writes flag 0 by default. Indigo interprets flagged wedges in such
  // V2000 files as a mixture, even when the source SMILES defines absolute stereo.
  // Preserve all coordinates and bond flags, including unspecified stereochemistry.
  const lines = molfile.split("\n");
  const counts = lines[3];
  if (!counts || !/^.{12}  0.{18} V2000\s*$/.test(counts)) return molfile;
  lines[3] = counts.slice(0, 12) + "  1" + counts.slice(15);
  return lines.join("\n");
}

export function hasRelativeStereo(molfile: string) {
  return /MDLV30\/STER(?:AC|EL)\d*/.test(molfile);
}

/** Recover the recognized source if the drawing component cannot load it. */
export async function readRecognizedSource(
  service: StructureExport["structService"],
  result: RecognitionResult,
): Promise<RecognizedSourceExport | null> {
  const raw = result.rawSmiles?.trim();
  if (!raw || raw.length > 100_000 || result.molfile.length > 5 * 1024 ** 2)
    return null;

  const molfile = recognizedDrawing(result);
  let expected: string;
  try {
    expected = await service.getInChIKey(identityInput(raw));
    if (!expected?.trim() || expected !== await service.getInChIKey(molfile))
      return null;
  } catch {
    return null;
  }

  try {
    // Verify the recognized graph as read, including stereo inferred from its
    // depiction. A metadata allowlist alone cannot prove that stripping is safe.
    const text = result.smiles.trim();
    if (
      plainStereoSmiles(raw) &&
      isPortableLine(text) &&
      !hasRelativeStereo(molfile) &&
      expected === await service.getInChIKey(text)
    ) return { text, molfile };

  } catch {
    // A reader failure for the text does not invalidate the verified MOL.
  }
  return { text: "", molfile };
}

export async function readRecognizedStereoFile(
  service: StructureExport["structService"],
  result: RecognitionResult,
  format: "mol" | "sdf",
) {
  const original = await readRecognizedSource(service, result);
  if (!original)
    throw new SmilesHandoffError("无法核对原始立体化学，已停止导出。");
  return format === "mol" ? original.molfile : original.molfile.trimEnd() + "\n$$$$\n";
}

export async function readPortableSmiles(
  editor: StructureExport,
  recognized?: RecognitionResult,
) {
  let smiles: string;
  let mol: string;
  try {
    smiles = (await editor.getSmiles(false)).trim();
    mol = await editor.getMolfile("v3000");
  } catch {
    throw new SmilesHandoffError(
      "无法生成可回读的单行 SMILES，请下载 MOL V3000。",
    );
  }
  // Indigo encodes ring double-bond geometry in CXSMILES; the recognizing
  // worker can already express that same bond with slash notation. The caller
  // supplies the recognized result only at its original drawing revision.
  const original = recognized?.rawSmiles?.trim();
  const plain = plainStereoSmiles(smiles);
  const ringStereoSource = !plain && hasOnlyRingAndAbsoluteStereo(smiles)
    ? recognized : undefined;
  if (
    hasRelativeStereo(mol) ||
    (recognized && hasRelativeStereo(recognized.molfile)) ||
    (original && !plainStereoSmiles(original)) ||
    (hasSmilesExtension(smiles) && !plain && !ringStereoSource)
  )
    throw new SmilesHandoffError(
      "此结构含扩展注释或相对手性，请下载 MOL V3000 保留完整结构。",
    );

  if (!plain && !ringStereoSource)
    throw new SmilesHandoffError(
      "无法生成可回读的单行 SMILES，请下载 MOL V3000。",
    );

  try {
    const expected = await editor.structService.getInChIKey(mol);
    if (!expected?.trim()) throw new Error("Unverified drawing");
    if (ringStereoSource) {
      const source = await readRecognizedSource(editor.structService, ringStereoSource);
      if (source?.text && expected === await editor.structService.getInChIKey(source.text))
        return source.text;
    } else if (plain) {
      const inputs = new Set([original && identityInput(original), identityInput(smiles), plain]);
      for (const input of inputs) {
        if (input && expected !== await editor.structService.getInChIKey(input))
          throw new Error("Molecular identity changed");
      }
      return plain;
    }
  } catch {
    // The MOL path remains available for structures without an InChI round trip.
  }
  throw new SmilesHandoffError(
    "无法核对 SMILES 的结构与立体化学，请下载 MOL V3000。",
  );
}
