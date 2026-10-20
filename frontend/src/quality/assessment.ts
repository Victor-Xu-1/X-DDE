import { contextMetrics, featureCounts } from "./generated";
import type { PoseQualityResult } from "./types";

type NativeCheck = PoseQualityResult["checks"][number];
export type AssessmentOutcome =
  NativeCheck["outcome"] | "unassessed" | "not_applicable";
export type AssessmentReason =
  | "missing_receptor"
  | "missing_distance"
  | "invalid_distance"
  | "missing_overlap"
  | "invalid_overlap"
  | "missing_feature_count"
  | "invalid_feature_count"
  | "no_matching_feature";
export interface AssessedCheck extends NativeCheck {
  assessment: AssessmentOutcome;
  reason?: AssessmentReason;
}

function assessCheck(
  row: NativeCheck,
  result: PoseQualityResult,
): AssessedCheck {
  const native: AssessedCheck = { ...row, assessment: row.outcome };
  // Never hide a native failure or turn an unavailable check into a pass.
  if (row.outcome !== "pass") return native;
  const context = Object.hasOwn(contextMetrics, row.id)
    ? contextMetrics[row.id]
    : undefined;
  if (context) {
    if (!result.inputs?.protein)
      return {
        ...native,
        assessment: "unassessed",
        reason: "missing_receptor",
      };
    const [metric, kind] = context;
    const value = result.metrics?.[metric];
    if (value === undefined || value === null)
      return { ...native, assessment: "unassessed", reason: `missing_${kind}` };
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      (kind === "overlap" && value > 1)
    )
      return { ...native, assessment: "unassessed", reason: `invalid_${kind}` };
  }
  const countMetric = Object.hasOwn(featureCounts, row.id)
    ? featureCounts[row.id]
    : undefined;
  if (countMetric) {
    const count = result.metrics?.[countMetric];
    if (count === undefined || count === null)
      return {
        ...native,
        assessment: "unassessed",
        reason: "missing_feature_count",
      };
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)
      return {
        ...native,
        assessment: "unassessed",
        reason: "invalid_feature_count",
      };
    if (count === 0)
      return {
        ...native,
        assessment: "not_applicable",
        reason: "no_matching_feature",
      };
  }
  return native;
}

/** Read-only presentation accounting; native flags, thresholds and files stay intact. */
export function assessQuality(result: PoseQualityResult) {
  const checks = result.checks.map((row) => assessCheck(row, result));
  const counts: Record<AssessmentOutcome, number> = {
    pass: 0,
    fail: 0,
    unavailable: 0,
    unassessed: 0,
    not_applicable: 0,
  };
  const nativeCounts = { pass: 0, fail: 0, unavailable: 0 };
  for (const check of checks) {
    counts[check.assessment]++;
    nativeCounts[check.outcome]++;
  }
  const assessed = counts.pass + counts.fail;
  const classification = counts.fail
    ? "fails"
    : counts.unassessed || counts.unavailable || assessed === 0
      ? "incomplete"
      : "passes";
  return { checks, counts, nativeCounts, assessed, classification };
}
