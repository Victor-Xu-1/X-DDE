import type { NativePoseScore } from "../viewer/PoseScore";
import type { PoseResult } from "./types";
interface NativeDockingContext {
  software_version: string | null;
  options?: { scoring?: string };
}
export function poseScore(
  result: NativeDockingContext,
  pose: PoseResult,
): NativePoseScore | null {
  const score = pose.scores.find(
    (s) =>
      s.name === "minimizedAffinity" &&
      s.unit === "kcal/mol" &&
      Number.isFinite(s.value),
  );
  if (!result.software_version || !pose.valid || !pose.artifact || !score)
    return null;
  return {
    value: score.value,
    unit: "kcal/mol",
    method: `GNINA ${result.software_version}`,
    scoring: result.options?.scoring,
    scope: "whole_pose",
  };
}
