import type { NativePoseScore } from "../viewer/PoseScore";
import type { DockingResult, PoseResult } from "./types";
export function poseScore(
  result: DockingResult,
  pose: PoseResult,
): NativePoseScore | null {
  const score = pose.scores.find(
    (s) =>
      s.name === "minimizedAffinity" &&
      s.unit === "kcal/mol" &&
      Number.isFinite(s.value),
  );
  if (!pose.valid || !pose.artifact || !score) return null;
  return {
    value: score.value,
    unit: "kcal/mol",
    method: `GNINA ${result.software_version}`,
    scoring: result.options?.scoring,
    scope: "whole_pose",
  };
}
