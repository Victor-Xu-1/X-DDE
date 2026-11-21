import {
  alleneHandoffSmiles, directionalRingStereoBonds, ringStereoEntries, writeRingStereo,
} from "./portable-smiles-ring-stereo";

type StructureReader = {
  getInChIKey(structure: string): Promise<string>;
  layout?(data: { struct: string; output_format: string }): Promise<{ struct: string }>;
};
type StructureExport = {
  getSmiles(isExtended?: boolean): Promise<string>;
  getMolfile(format: "v3000"): Promise<string>;
  structService: StructureReader;
};
type ReadStructure = (structure: string, format?: "ket") => Promise<string>;

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
  const [molecule, annotation] = raw.split("|", 2);
  if (/\[(?:\d+)?[A-Z][a-z]?@(?:SP|TB|OH)\d/.test(molecule) ||
      /(?:^|,)\^[1-7]:/.test(annotation ?? ""))
    return { text: "", molfile: "", sourceOnly: "unverified-stereo" };
  const body = molecule.split(/\s/, 1)[0];
  const axial = alleneHandoffSmiles(body);
  if (axial === false) return null;
  // In the source-only path the line carries the stereo. Remove a suffix only
  // when it consists entirely of planar display coordinates.
  const portable = axial && raw.length <= 100_000 && stereoSmiles(raw)?.stereo === "";
  return {
    text: portable ? axial : "",
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
  if (stereo && !/^(?:[act]|\^[1-7]):\d+(?:,\d+)*(?:,(?:[act]|\^[1-7]):\d+(?:,\d+)*)*$/.test(stereo))
    return null;
  return {
    text,
    plain: /(?:^|,)[ct]:/.test(stereo) ? null : text,
    identity: stereo ? `${text} |${stereo}|` : text,
    stereo,
    radical: /(?:^|,)\^[1-7]:/.test(stereo),
  };
}

/** Indigo's KET conversion retains the input atom order within a molecule.
 * Compare the inferred positions to the original CXSMILES indices. */
async function preservesRadical(
  read: ReadStructure,
  from: NonNullable<ReturnType<typeof stereoSmiles>>,
) {
  if (!from.plain || from.plain.includes(".") || /(?:^|,)\^[2-7]:/.test(from.stereo)) return false;
  const expected = [...from.stereo.matchAll(/(?:^|,)\^1:(\d+(?:,\d+)*)/g)]
    .flatMap(([, indices]) => indices.split(",").map(Number)).sort((a, b) => a - b);
  const molecules = Object.values(JSON.parse(await read(from.plain, "ket")))
    .filter((node): node is {type: "molecule"; atoms: {radical?: number}[]} =>
      typeof node === "object" && node !== null && "type" in node && node.type === "molecule");
  if (molecules.length !== 1 || !Array.isArray(molecules[0].atoms)) return false;
  const observed = molecules[0].atoms.flatMap((atom, index) => atom.radical ? [[index, atom.radical]] : []);
  // KET uses MDL radical code 2 for a doublet.
  return observed.length === expected.length &&
    observed.every(([index, state], i) => index === expected[i] && state === 2);
}

async function readStandardRingStereo(
  readSmiles: ReadStructure,
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

function hasMolRadical(molfile: string) {
  return /(?:^M  RAD\s+\d|\bRAD=[1-9]\d*\b)/m.test(molfile);
}

export function hasRecognizedRingStereo(result: RecognitionResult) {
  const raw = result.rawSmiles?.trim();
  if (!raw || raw.length > 100_000) return false;
  const source = stereoSmiles(raw);
  return Boolean(source && (source.plain === null || directionalRingStereoBonds(source.text).length));
}

async function readRecognizedRing(
  service: StructureExport["structService"],
  source: NonNullable<ReturnType<typeof stereoSmiles>>,
  normalized: string,
  molfile: string,
  readSmiles: ReadStructure,
): Promise<RecognizedSourceExport | null> {
  if (!isPortableLine(normalized) || source.radical || hasRelativeStereo(molfile))
    return null;
  const rings = ringStereoEntries(source.stereo)
    .map(([index, cis]) => `${cis ? "c" : "t"}:${index}`);
  if (rings.length === 0 || rings.length > 16) return null;
  const absolute = source.stereo.match(/(?:^|,)a:\d+(?:,\d+)*/g)
    ?.map((item) => item.replace(/^,/, "")) ?? [];
  const identity = (entries: string[]) => {
    const labels = [...absolute, ...entries].join(",");
    return labels ? `${source.text} |${labels}|` : source.text;
  };
  const key = (text: string) => service.getInChIKey(text);
  const expected = await key(source.identity);
  const unspecified = await key(identity([]));
  if (!expected?.trim() || !unspecified?.trim() || expected === unspecified) return null;
  // An overall key can preserve one configured bond and ignore another. Prove
  // that removing any one declared configuration changes the native identity.
  if (rings.length > 1) {
    for (const index of rings.keys()) {
      const without = await key(identity(rings.filter((_, entry) => entry !== index)));
      if (!without?.trim() || without === expected) return null;
    }
  }
  const fileKey = await key(molfile);
  const textKey = await key(normalized);
  const agrees = (value: string) => value === expected || value === unspecified;
  if (!agrees(fileKey) || !agrees(textKey)) return null;
  const text = await readStandardRingStereo(readSmiles, service, source, expected);
  if (!text) return null;
  return { text, molfile: fileKey === expected ? molfile : "" };
}

/** Rebuild a file when applying the absolute flag changes the native reading. */
async function recoverAbsoluteDrawing(
  service: StructureReader,
  result: RecognitionResult,
  depiction: string,
  text: string,
  expected: string,
) {
  if (!service.layout || !isPortableLine(text) || !text.includes("@") ||
      expected !== await service.getInChIKey(text)) return null;

  const inspected = await service.layout({ struct: depiction, output_format: "chemical/x-indigo-ket" });
  if (expected !== await service.getInChIKey(inspected.struct)) return null;
  const derived = await service.layout({ struct: text, output_format: "chemical/x-mdl-molfile" });
  const molfile = recognizedDrawing({ ...result, molfile: derived.struct });
  if (!/^M  END\s*$/m.test(molfile) || hasRelativeStereo(molfile) ||
      hasMolRadical(molfile) || expected !== await service.getInChIKey(molfile)) return null;
  return { text, molfile };
}

/** Recover and verify a representation of the recognized structure. */
export async function readRecognizedSource(
  service: StructureExport["structService"],
  result: RecognitionResult,
  readSmiles?: ReadStructure,
  drawing?: string,
): Promise<RecognizedSourceExport | null> {
  const sourceOnly = recognizedStereoSource(result);
  if (sourceOnly) return sourceOnly;
  const raw = result.rawSmiles?.trim();
  const molfile = drawing ?? recognizedDrawing(result);
  if (!raw || raw.length > 100_000 || molfile.length > 5 * 1024 ** 2) return null;
  // The rejected drawing cannot corroborate radical spin. The fallback
  // compares only InChIKeys, which are insufficient for that file.
  if (hasMolRadical(molfile)) return null;
  const source = stereoSmiles(raw);
  const text = result.smiles.trim();
  let expected: string;
  try {
    const directional = source ? directionalRingStereoBonds(source.text) : [];
    if (source && (source.plain === null || directional.length)) {
      if (!readSmiles) return null;
      const indexed = directional.length === 0 ? source :
        stereoSmiles((await readSmiles(source.identity)).trim());
      if (indexed?.plain !== null) return null;
      if (source !== indexed) {
        const explicit = ringStereoEntries(source.stereo).map(([index]) => index);
        const declared = new Set([...directional, ...explicit]);
        if (declared.size !== ringStereoEntries(indexed.stereo).length ||
            await service.getInChIKey(source.identity) !== await service.getInChIKey(indexed.identity))
          return null;
      }
      return await readRecognizedRing(service, indexed, text, molfile, readSmiles);
    }
    expected = await service.getInChIKey(source?.identity ?? raw);
    if (!expected?.trim()) return null;
    if (expected !== await service.getInChIKey(molfile)) {
      // This recovery applies to the generated absolute depiction only. In
      // particular, a changed drawing or enhanced stereo stays protected.
      if (drawing !== undefined || molfile === result.molfile || source?.stereo !== "") return null;
      return await recoverAbsoluteDrawing(service, result, molfile, text, expected);
    }
  } catch {
    return null;
  }

  try {
    // Verify the recognized graph as read, including stereo inferred from its
    // depiction. A metadata allowlist alone cannot prove that stripping is safe.
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
  readSmiles?: ReadStructure,
) {
  if (recognized && recognizedStereoSource(recognized))
    throw new SmilesHandoffError("绘图组件无法核对原始 SMILES 的立体化学。");
  if (recognized && hasRecognizedRingStereo(recognized)) {
    const { text } = await readRecognizedRingDrawing(editor, recognized, readSmiles);
    if (text) return text;
    throw new SmilesHandoffError("无法核对双键构型，已停止导出。");
  }
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
    if (exported.radical || hasMolRadical(mol)) {
      if (!exported.radical || !readSmiles || !exported.plain ||
          stereoSmiles((await readSmiles(mol)).trim())?.identity !== exported.identity ||
          !await preservesRadical(readSmiles, exported))
        throw new Error("Radical annotation cannot round trip");
    }
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

/** Keep the native file and portable text on the same drawing revision. */
export async function readRecognizedRingDrawing(
  editor: StructureExport,
  result: RecognitionResult,
  readSmiles?: ReadStructure,
): Promise<RecognizedSourceExport> {
  if (readSmiles) {
    try {
      const drawing = await editor.getMolfile("v3000");
      const value = await readRecognizedSource(editor.structService, result, readSmiles, drawing);
      if (value) return value;
    } catch {
      // The current drawing could not produce a verifiable snapshot.
    }
  }
  return { text: "", molfile: "" };
}
