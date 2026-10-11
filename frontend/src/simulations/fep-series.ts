import { AssetFileError, readAssetFile } from "../research/asset-file";
import type { MoleculeRef } from "../research/types";

export interface FepRecord {
  record: number;
  name: string;
}
export const fepSeriesLimit = 25 * 1024 ** 2;

/** Inspect SDF framing only. Native chemistry and bound-pose validation remain in OpenFE. */
export function fepRecordNames(text: string): FepRecord[] {
  const blocks = text.split(/^\$\$\$\$[ \t]*(?:\r?\n|$)/gm);
  if (!blocks[blocks.length - 1].trim()) blocks.pop();
  if (blocks.length > 500) throw new AssetFileError("limit");
  if (
    !blocks.length ||
    blocks.some((block) => !/^M  END[ \t]*\r?$/m.test(block))
  )
    throw new AssetFileError("format");
  return blocks.map((block, record) => ({
    record,
    name: block.split(/\r?\n/, 1)[0].trim(),
  }));
}

export async function readFepSeries(
  reference: MoleculeRef,
  signal: AbortSignal,
) {
  const bytes = await readAssetFile(reference, signal, {
    kind: "ligand",
    suffixes: [".sdf"],
    maxBytes: fepSeriesLimit,
  });
  return fepRecordNames(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
}

export function validFepSelection(
  records: FepRecord[] | undefined,
  selected: number[],
) {
  return Boolean(
    records &&
    selected.length >= 2 &&
    selected.length <= 12 &&
    new Set(selected).size === selected.length &&
    selected.every(
      (record) =>
        Number.isInteger(record) && record >= 0 && record < records.length,
    ),
  );
}
