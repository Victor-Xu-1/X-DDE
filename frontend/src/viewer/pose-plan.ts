import type { NativePoseScore } from "./PoseScore";
import { poseSource } from "./pose-source";
import type { PreviewPose } from "./pose-types";

export interface PoseFrame {
  sourceSnapshot?: boolean;
  nativeArtifactSha256?: string;
  nativeArtifactRecord?: number;
  urls: string[];
  records?: number[];
  nativeScore?: NativePoseScore | null;
  molecularSource?: { url: string; record?: number };
  comparison?: boolean;
}

/** One source interpretation for the viewer, its history and downstream input. */
export function posePlan(frame: PoseFrame): {
  base: PreviewPose;
  index: number;
  key: string;
} {
  const index = frame.molecularSource
    ? frame.urls.indexOf(frame.molecularSource.url)
    : frame.urls.length === 1
      ? 0
      : -1;
  const records = [...(frame.records ?? frame.urls.map(() => 0))];
  if (index >= 0 && frame.molecularSource?.record !== undefined)
    records[index] = frame.molecularSource.record;
  const nativeArtifactSha256 = frame.nativeArtifactSha256;
  const approvedRecord = frame.nativeArtifactRecord ?? 0;
  const verifiedArtifactRecord =
    frame.urls.length === 1 &&
    records[0] === approvedRecord &&
    nativeArtifactSha256 &&
    /^[a-f0-9]{64}$/.test(nativeArtifactSha256) &&
    poseSource(frame.urls[0], approvedRecord)?.kind === "artifact";
  const base: PreviewPose = {
    urls: frame.urls,
    records:
      frame.records || frame.molecularSource?.record !== undefined
        ? records
        : undefined,
    score: frame.nativeScore,
    ...(verifiedArtifactRecord ? { nativeArtifactSha256 } : {}),
    source:
      !frame.sourceSnapshot && !frame.comparison && index >= 0
        ? poseSource(
            frame.urls[index],
            frame.molecularSource?.record ?? frame.records?.[index] ?? 0,
          )
        : null,
    receptor:
      !frame.sourceSnapshot &&
      !frame.comparison &&
      frame.molecularSource &&
      frame.urls.length === 2 &&
      index === 1
        ? poseSource(frame.urls[0], frame.records?.[0] ?? 0)
        : null,
  };
  return { base, index, key: JSON.stringify(base) };
}
