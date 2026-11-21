import { hasAlleneShorthand, ringStereoEntries, writeRingStereo } from "./portable-smiles-ring-stereo";

type StructureExport = {
  getSmiles(isExtended?: boolean): Promise<string>;
  getMolfile(format: "v3000"): Promise<string>;
  structService: {
    getInChIKey(structure: string): Promise<string>;
  };
};
type ReadSmiles = (structure: string) => Promise<string>;

export type RecognitionResult = {
  rawSmiles?: string | null;
  smiles: string;
  molfile: string;
};

export type RecognizedSourceExport = {
  text: string;
  molfile: string;
  sourceOnly?: "allene" | "unverified-stereo";
};

export class SmilesHandoffError extends Error {}

/** Indigo can return CXSMILES even from getSmiles(false). */
export function hasSmilesExtension(value: string) {
  return value.includes("|");
}

function isPortableLine(value: string) {
  return /^[\x21-\x7e]+$/.test(value) && !/[>|]/.test(value);
}

/** Keep export on the recognized source when the drawing cannot retain its stereo. */
export function recognizedStereoSource({ rawSmiles }: RecognitionResult): RecognizedSourceExport | null {
  const raw = rawSmiles?.trim();
  if (!raw) return null;
  const molecule = raw.split(/\s|\|/, 1)[0];
  if (/\[(?:\d+)?[A-Z][a-z]?@(?:SP|TB|OH)\d/.test(molecule))
    return { text: "", molfile: "", sourceOnly: "unverified-stereo" };
  const axial = /\[(?:\d+)?C@AL[12](?:[+-]\d*|:\d+)*\]/.test(molecule) ||
    hasAlleneShorthand(molecule);
  if (axial === false) return null;
  return {
    text: axial && raw.length <= 100_000 && isPortableLine(raw) ? raw : "",
    molfile: "",
    sourceOnly: axial ? "allene" : "unverified-stereo",
  };
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

/** Keep chemical stereo data for comparison, apart from planar drawing coordinates. */
function stereoSmiles(value: string) {
  if (isPortableLine(value)) return { text: value, plain: value, identity: value, stereo: "", radical: false };
  const match = /^(\S+) \|([^|]+)\|$/.exec(value);
  if (!match || !isPortableLine(match[1])) return null;
  const [, text, annotation] = match;
  let stereo = annotation;
  if (annotation.startsWith("(")) {
    const coordinates = /^(\([^()]+\))(?:,(.+))?$/.exec(annotation);
    if (!coordinates || !isPlanarCoordinateList(coordinates[1])) return null;
    stereo = coordinates[2] ?? "";
  }
  if (stereo && !/^(?:[act]|\^[1-3]):\d+(?:,\d+)*(?:,(?:[act]|\^[1-3]):\d+(?:,\d+)*)*$/.test(stereo))
    return null;
  return {
    text,
    plain: /(?:^|,)[ct]:/.test(stereo) ? null : text,
    identity: stereo ? `${text} |${stereo}|` : text,
    stereo,
    radical: /(?:^|,)\^[1-3]:/.test(stereo),
  };
}

/** A bracket atom can imply a radical in plain SMILES. Check its full
 * annotation on read-back, since InChI alone can miss spin-state changes. */
async function preservesRadical(
  readSmiles: ReadSmiles,
  extended: string,
  plain: string,
) {
  const read = async (value: string) => stereoSmiles((await readSmiles(value)).trim());
  const annotated = await read(extended);
  return Boolean(annotated?.radical && annotated.identity === (await read(plain))?.identity);
}

async function readStandardRingStereo(
  readSmiles: ReadSmiles,
  service: StructureExport["structService"],
  exported: NonNullable<ReturnType<typeof stereoSmiles>>,
  expected: string,
) {
  const candidate = writeRingStereo(exported.text, exported.stereo);
  if (!candidate) return null;
  try {
    const read = async (struct: string) => stereoSmiles((await readSmiles(struct)).trim());
    const reference = await read(exported.identity);
    const restored = await read(candidate);
    if (reference?.identity && reference.identity === restored?.identity &&
        ringStereoEntries(reference.stereo).length === ringStereoEntries(exported.stereo).length &&
        expected === await service.getInChIKey(candidate)) {
      return candidate;
    }
  } catch {
    // A native reader can decline unfamiliar directional stereo.
  }
  return null;
}

/** Repair the generated depiction using the same OCR result's absolute stereo. */
export function recognizedDrawing({ rawSmiles, smiles, molfile }: RecognitionResult) {
  if (!rawSmiles || rawSmiles.length > 100_000) return molfile;
  const raw = stereoSmiles(rawSmiles.trim());
  if (!raw?.text.includes("@") || !smiles.includes("@") || hasRelativeStereo(molfile))
    return molfile;

  // RDKit writes flag 0 by default. Indigo interprets wedged centers outside
  // an explicit STEABS collection as a mixture unless the chiral flag is set.
  // Preserve all coordinates and bond flags, including unspecified stereochemistry.
  const lines = molfile.split("\n");
  const counts = lines[3];
  if (counts && /^.{33} V3000\s*$/.test(counts) &&
      lines[4]?.trimEnd() === "M  V30 BEGIN CTAB") {
    const v30Counts = /^(M  V30 COUNTS (?:\d+ ){4})0(\r?)$/.exec(lines[5] ?? "");
    if (!v30Counts) return molfile;
    lines[5] = v30Counts[1] + "1" + v30Counts[2];
    return lines.join("\n");
  }
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
  const sourceOnly = recognizedStereoSource(result);
  if (sourceOnly) return sourceOnly;
  const raw = result.rawSmiles?.trim();
  if (!raw || raw.length > 100_000 || result.molfile.length > 5 * 1024 ** 2)
    return null;

  const molfile = recognizedDrawing(result);
  const source = stereoSmiles(raw);
  // InChI alone cannot verify an explicit spin assignment in a rejected drawing.
  if (source?.radical) return null;
  let expected: string;
  try {
    expected = await service.getInChIKey(source?.identity ?? raw);
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
      source &&
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
  if (!original?.molfile)
    throw new SmilesHandoffError("无法核对原始立体化学，已停止导出。");
  return format === "mol" ? original.molfile : original.molfile.trimEnd() + "\n$$$$\n";
}

export async function readPortableSmiles(
  editor: StructureExport,
  recognized?: RecognitionResult,
  readSmiles?: ReadSmiles,
) {
  if (recognized && recognizedStereoSource(recognized))
    throw new SmilesHandoffError("绘图组件无法核对原始 SMILES 的立体化学。");
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
  // The recognized source is available only at its original drawing revision.
  const raw = recognized?.rawSmiles?.trim();
  const original = raw ? stereoSmiles(raw) : null;
  const exported = stereoSmiles(smiles);
  if (
    hasRelativeStereo(mol) ||
    (recognized && hasRelativeStereo(recognized.molfile)) ||
    (raw && !original) ||
    (hasSmilesExtension(smiles) && !exported)
  )
    throw new SmilesHandoffError(
      "此结构含扩展注释或相对手性，请下载 MOL V3000 保留完整结构。",
    );

  if (!exported)
    throw new SmilesHandoffError(
      "无法生成可回读的单行 SMILES，请下载 MOL V3000。",
    );

  try {
    const expected = await editor.structService.getInChIKey(mol);
    if (!expected?.trim()) throw new Error("Unverified drawing");
    if (exported.radical) {
      if (!readSmiles || !exported.plain ||
          stereoSmiles((await readSmiles(mol)).trim())?.identity !== exported.identity ||
          !await preservesRadical(readSmiles, exported.identity, exported.plain))
        throw new Error("Radical annotation cannot round trip");
    }
    if (original?.radical && original.identity !== exported.identity)
      throw new Error("Recognized radical annotation cannot be matched to the drawing");
    if (!exported.plain) {
      if (expected !== await editor.structService.getInChIKey(exported.identity))
        throw new Error("Editor ring stereochemistry changed");
      if (original && expected !== await editor.structService.getInChIKey(original.identity))
        throw new Error("Recognized ring stereochemistry changed");
      if (recognized) {
        const source = await readRecognizedSource(editor.structService, recognized);
        if (source?.text && expected === await editor.structService.getInChIKey(source.text))
          return source.text;
      }
      if (readSmiles) {
        const standard = await readStandardRingStereo(readSmiles, editor.structService, exported, expected);
        if (standard) return standard;
      }
    } else {
      const inputs = new Set([original?.identity, exported.identity, exported.plain]);
      for (const input of inputs) {
        if (input && expected !== await editor.structService.getInChIKey(input))
          throw new Error("Molecular identity changed");
      }
      return exported.plain;
    }
  } catch {
    // The MOL path remains available for structures without an InChI round trip.
  }
  throw new SmilesHandoffError(
    "无法核对 SMILES 的结构与立体化学，请下载 MOL V3000。",
  );
}
