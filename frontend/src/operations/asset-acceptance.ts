import type { Asset, AssetKind } from "./types";
export const assetFormats: Record<AssetKind, readonly string[]> = {
  measurements: [".csv"],
  structure: [".pdb", ".cif"],
  ligand: [".sdf", ".mol", ".mol2", ".pdb"],
  msa: [".a3m"],
  template: [".a3m", ".hhr"],
  config: [".json", ".yaml", ".yml"],
  sequences: [".fasta", ".fa"],
  library: [
    ".sdf",
    ".csv",
    ".tsv",
    ".smi",
    ".smiles",
    ".sdf.gz",
    ".csv.gz",
    ".tsv.gz",
  ],
  counts: [".csv", ".tsv", ".csv.gz", ".tsv.gz"],
  reads: [".fastq", ".fq", ".fastq.gz", ".fq.gz"],
};
export function acceptedAsset(
  asset: Asset,
  id: string,
  kind: AssetKind,
  formats: readonly string[],
  maxBytes: number,
) {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    asset?.id === id &&
    asset.kind === kind &&
    formats.includes(asset.suffix) &&
    Number.isInteger(asset.size) &&
    asset.size > 0 &&
    asset.size <= maxBytes &&
    /^[a-f0-9]{64}$/.test(asset.sha256)
  );
}
