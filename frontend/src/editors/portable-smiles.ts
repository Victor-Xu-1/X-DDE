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

function absoluteSmiles(value: string) {
  const text = value.replace(/ \|a:\d+(?:,\d+)*\|$/, "");
  return isPortableLine(text) ? text : null;
}

function hasOnlyRingAndAbsoluteStereo(value: string) {
  return /^\S+ \|(?:[act]:\d+(?:,\d+)*)(?:,[act]:\d+(?:,\d+)*)*\|$/.test(value);
}

/** Repair the generated V2000 depiction using the same OCR result's stereo. */
export function recognizedDrawing({ rawSmiles, smiles, molfile }: RecognitionResult) {
  const raw = absoluteSmiles(rawSmiles?.trim() ?? "");
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
  try {
    const expected = await service.getInChIKey(raw);
    if (!expected?.trim() || expected !== await service.getInChIKey(molfile))
      return null;

    // An explicit absolute group may be redundant with @/@@. Keep all other
    // extended annotations out of the plain export, even when InChI ignores them.
    const text = result.smiles.trim();
    if (
      absoluteSmiles(raw) &&
      isPortableLine(text) &&
      !hasRelativeStereo(molfile) &&
      expected === await service.getInChIKey(text)
    ) return { text, molfile };

    return { text: "", molfile };
  } catch {
    return null;
  }
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
  const extended = hasSmilesExtension(smiles);
  if (
    hasRelativeStereo(mol) ||
    (recognized && hasRelativeStereo(recognized.molfile)) ||
    (extended && !(recognized && hasOnlyRingAndAbsoluteStereo(smiles)))
  )
    throw new SmilesHandoffError(
      "此结构含扩展注释或相对手性，请下载 MOL V3000 保留完整结构。",
    );

  if (!extended && !isPortableLine(smiles))
    throw new SmilesHandoffError(
      "无法生成可回读的单行 SMILES，请下载 MOL V3000。",
    );

  try {
    const expected = await editor.structService.getInChIKey(mol);
    const candidate = extended && recognized
      ? (await readRecognizedSource(editor.structService, recognized))?.text
      : smiles;
    if (expected?.trim() && candidate &&
        expected === await editor.structService.getInChIKey(candidate))
      return candidate;
  } catch {
    // The MOL path remains available for structures without an InChI round trip.
  }
  throw new SmilesHandoffError(
    "无法核对 SMILES 的结构与立体化学，请下载 MOL V3000。",
  );
}
