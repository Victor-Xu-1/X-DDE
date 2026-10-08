import type { DesignDraft } from "../operations/campaign-model";
import type { SequenceRegion } from "../presentation/SequenceTrack";
import type { PreparedExample } from "./types";

export function campaignMaterials(draft: DesignDraft) {
  return [
    ...Object.entries(draft.targets).map(([chain, sequence]) => ({
      key: `target:${chain}`,
      role: "target" as const,
      chain,
      sequence,
      positions: [] as number[],
      source: "her2_domain_iv",
    })),
    ...Object.entries(draft.binders).map(([chain, sequence]) => ({
      key: `binder:${chain}`,
      role: "binder" as const,
      chain,
      sequence,
      positions: draft.cdr[chain] ?? [],
      source: "her2",
    })),
  ];
}

/** Draft positions are zero-based indices of the exact input sequence. */
export function mutableRegions(
  sequence: string,
  positions: readonly number[],
): SequenceRegion[] | null {
  if (
    positions.some(
      (n) => !Number.isSafeInteger(n) || n < 0 || n >= sequence.length,
    )
  )
    return null;
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  const regions: SequenceRegion[] = [];
  for (const index of sorted) {
    const current = regions.at(-1);
    if (current && current.end === index) current.end = index + 1;
    else regions.push({ start: index + 1, end: index + 1, label: "CDR" });
  }
  return regions;
}

export function campaignReference(example: PreparedExample, name: string) {
  const object = example.objects[name];
  const reference = object?.reference;
  return object?.kind === "structure" &&
    reference &&
    reference.record === 0 &&
    reference.conformer === 0 &&
    /^[0-9a-f-]{36}$/i.test(reference.asset_id)
    ? reference
    : null;
}
