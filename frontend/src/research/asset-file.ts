import { request } from "../api";
import type { Asset, AssetKind } from "../operations/types";
import type { MoleculeRef } from "./types";

export class AssetFileError extends Error {
  constructor(public code: "format" | "limit" | "identity") {
    super(code);
  }
}

interface AssetFilePolicy {
  kind: AssetKind;
  suffixes: readonly string[];
  maxBytes: number;
}

/** Preserve the byte-only contract for sequence and FEP consumers. */
export async function readAssetFile(
  reference: MoleculeRef,
  signal: AbortSignal,
  policy: AssetFilePolicy,
): Promise<Uint8Array<ArrayBuffer>> {
  return (await readAssetFileWithMetadata(reference, signal, policy)).bytes;
}

/** Read one immutable input and its validated format, bounded during transfer. */
export async function readAssetFileWithMetadata(
  reference: MoleculeRef,
  signal: AbortSignal,
  policy: AssetFilePolicy,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; suffix: string }> {
  const id = encodeURIComponent(reference.asset_id);
  const asset = await request<Asset>(`/assets/${id}/metadata`, { signal });
  signal.throwIfAborted();
  if (asset.id !== reference.asset_id || asset.sha256 !== reference.sha256)
    throw new AssetFileError("identity");
  if (asset.kind !== policy.kind || !policy.suffixes.includes(asset.suffix))
    throw new AssetFileError("format");
  if (
    !Number.isInteger(asset.size) ||
    asset.size < 1 ||
    asset.size > policy.maxBytes
  )
    throw new AssetFileError("limit");
  const response = await fetch(`/api/assets/${id}`, { signal });
  if (!response.ok || !response.body)
    throw new Error("Research file unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > asset.size) {
        await reader.cancel();
        throw new AssetFileError("identity");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  signal.throwIfAborted();
  if (length !== asset.size) throw new AssetFileError("identity");
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  signal.throwIfAborted();
  const sha256 = Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  if (sha256 !== reference.sha256) throw new AssetFileError("identity");
  return { bytes, suffix: asset.suffix };
}
