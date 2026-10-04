import type { NumberedResidue } from "./types";
import type { SequenceRegion } from "../presentation/SequenceTrack";
export function numberedRegions(
  rows: readonly NumberedResidue[],
): SequenceRegion[] {
  return (["CDR1", "CDR2", "CDR3"] as const).flatMap((label) => {
    const positions = rows
      .filter((row) => row.region === label)
      .map((row) => row.source_position);
    return positions.length
      ? [{ label, start: Math.min(...positions), end: Math.max(...positions) }]
      : [];
  });
}
