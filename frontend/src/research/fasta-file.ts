import { AssetFileError, readAssetFile } from "./asset-file";
import type { MoleculeRef } from "./types";

export interface FastaRecord {
  header: string;
  sequence: string;
}
export class SequencePreviewError extends Error {
  constructor(public code: "format" | "limit" | "identity") {
    super(code);
  }
}
export const sequenceFileLimit = 2 * 1024 ** 2;

/** FASTA layout whitespace is not a sequence symbol; case and ambiguity are retained. */
export function parseFasta(text: string): FastaRecord[] {
  if (text.length > sequenceFileLimit) throw new SequencePreviewError("limit");
  const records: FastaRecord[] = [];
  let header: string | null = null;
  let parts: string[] = [];
  function finish() {
    if (header === null) return;
    const sequence = parts.join("");
    if (!sequence) throw new SequencePreviewError("format");
    records.push({ header, sequence });
  }
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line.trim() || line.startsWith(";")) continue;
    if (line.startsWith(">")) {
      finish();
      if (records.length >= 500) throw new SequencePreviewError("limit");
      header = line.slice(1);
      if (!header.trim() || header.length > 2000)
        throw new SequencePreviewError("format");
      parts = [];
    } else {
      const symbols = line.replace(/\s/g, "");
      if (header === null || !/^[A-Za-z*?.-]+$/.test(symbols))
        throw new SequencePreviewError("format");
      parts.push(symbols);
    }
  }
  finish();
  if (!records.length) throw new SequencePreviewError("format");
  return records;
}

export async function readSequenceFile(
  reference: MoleculeRef,
  signal: AbortSignal,
) {
  try {
    const bytes = await readAssetFile(reference, signal, {
      kind: "sequences",
      suffixes: [".fa", ".fasta"],
      maxBytes: sequenceFileLimit,
    });
    return parseFasta(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof AssetFileError)
      throw new SequencePreviewError(error.code);
    throw error;
  }
}
