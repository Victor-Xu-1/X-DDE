import type { ResearchColumn } from "../presentation/ResearchTable";
import type { Language } from "../types";
import type { BinderQualityReport, NativeCandidate } from "./types";

/** Reflect the original filter decisions; scores never determine this status. */
export function binderFilterColumn(
  report: BinderQualityReport | null | undefined,
  language: Language,
): ResearchColumn<NativeCandidate> {
  const zh = language === "zh";
  const decisions = new Map<string, boolean>();
  for (const design of report?.designs ?? []) {
    if (design.candidate_id) decisions.set(design.candidate_id, design.passed);
  }
  function text(row: NativeCandidate) {
    const passed = decisions.get(row.id);
    return passed === true
      ? zh
        ? "通过"
        : "Pass"
      : passed === false
        ? zh
          ? "未通过"
          : "Rejected"
        : zh
          ? "未评估"
          : "Not assessed";
  }
  return {
    key: "binder-native-filters",
    label: zh ? "原生筛选" : "Native filters",
    value: text,
    render: (row) => {
      const passed = decisions.get(row.id);
      return (
        <span
          className={
            passed === true
              ? "status succeeded"
              : passed === false
                ? "status failed"
                : "status"
          }
        >
          {text(row)}
        </span>
      );
    },
  };
}
