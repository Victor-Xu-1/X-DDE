import { request } from "../api";
import type { Asset } from "../operations/types";
import type { MoleculeRef } from "../research/types";

export class ReferenceMetadataError extends Error {
  constructor(public code: "identity" | "format") {
    super(code);
  }
}

export async function resolveReference(
  id: string,
  kind: "structure" | "ligand" | "sequences",
  formats: readonly string[],
  reference: MoleculeRef | undefined,
  signal: AbortSignal,
  onAsset?: (asset: Asset) => void,
): Promise<MoleculeRef> {
  const asset = await request<Asset>(
    `/assets/${encodeURIComponent(id)}/metadata`,
    { signal },
  );
  signal.throwIfAborted();
  if (
    asset.id !== id ||
    !/^[a-f0-9]{64}$/.test(asset.sha256) ||
    !Number.isInteger(asset.size) ||
    asset.size < 1
  )
    throw new ReferenceMetadataError("identity");
  if (
    asset.kind !== kind ||
    !formats.includes(asset.suffix) ||
    (kind === "sequences" && asset.size > 2 * 1024 ** 2)
  )
    throw new ReferenceMetadataError("format");
  if (reference) {
    if (
      reference.asset_id !== asset.id ||
      reference.sha256 !== asset.sha256 ||
      !Number.isInteger(reference.record) ||
      reference.record < 0 ||
      reference.record > 499 ||
      !Number.isInteger(reference.conformer) ||
      reference.conformer < 0 ||
      reference.conformer > 999 ||
      (kind !== "ligand" &&
        (reference.record !== 0 || reference.conformer !== 0)) ||
      (asset.suffix !== ".sdf" && reference.record !== 0)
    )
      throw new ReferenceMetadataError("identity");
    onAsset?.(asset);
    return reference;
  }
  onAsset?.(asset);
  return {
    asset_id: asset.id,
    sha256: asset.sha256,
    record: 0,
    conformer: 0,
    version_id: null,
  };
}
