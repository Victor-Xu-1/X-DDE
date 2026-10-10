import { request } from "../api";
import type { Asset } from "../operations/types";
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
  const id = encodeURIComponent(reference.asset_id);
  const asset = await request<Asset>(`/assets/${id}/metadata`, { signal });
  signal.throwIfAborted();
  if (asset.id !== reference.asset_id || asset.sha256 !== reference.sha256)
    throw new SequencePreviewError("identity");
  if (asset.kind !== "sequences" || ![".fa", ".fasta"].includes(asset.suffix))
    throw new SequencePreviewError("format");
  if (
    !Number.isInteger(asset.size) ||
    asset.size < 1 ||
    asset.size > sequenceFileLimit
  )
    throw new SequencePreviewError("limit");
  const response = await fetch(`/api/assets/${id}`, { signal });
  if (!response.ok) throw new Error("Sequence file unavailable");
  if (!response.body) throw new Error("Sequence response is empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > asset.size) {
        await reader.cancel();
        throw new SequencePreviewError("identity");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  signal.throwIfAborted();
  if (bytes.byteLength !== asset.size)
    throw new SequencePreviewError("identity");
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  signal.throwIfAborted();
  const sha256 = Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  if (sha256 !== reference.sha256) throw new SequencePreviewError("identity");
  return parseFasta(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
