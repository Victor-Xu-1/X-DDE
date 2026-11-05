import type { Language } from "../types";
import { assessmentLabels } from "./labels";
import {
  attentionCount,
  attentionOutcomes,
  type assessQuality,
  type AssessmentOutcome,
  type QualityFilter,
} from "./assessment";

type Assessment = ReturnType<typeof assessQuality>;

export function QualityAssessmentBar({
  assessment,
  language,
  filter,
  onFilter,
}: {
  assessment: Assessment;
  language: Language;
  filter: QualityFilter;
  onFilter(filter: QualityFilter): void;
}) {
  const zh = language === "zh";
  const { classification, counts } = assessment;
  const filters: QualityFilter[] = [
    "attention",
    "all",
    ...attentionOutcomes,
    "pass",
    "not_applicable",
  ];
  const label = (value: QualityFilter) =>
    value === "all"
      ? zh
        ? "全部项目"
        : "All checks"
      : value === "attention"
        ? zh
          ? "需关注项"
          : "Attention needed"
        : assessmentLabels[value][zh ? 0 : 1];
  const count = (value: QualityFilter) =>
    value === "all"
      ? assessment.checks.length
      : value === "attention"
        ? attentionCount(counts)
        : counts[value];
  return (
    <div className="quality-assessment-bar">
      <div
        role="status"
        className="quality-assessment-summary"
        aria-label={zh ? "质控评估摘要" : "Quality assessment summary"}
      >
        <strong>
          {classification === "passes"
            ? zh
              ? "已通过全部适用检查"
              : "All applicable checks passed"
            : classification === "fails"
              ? zh
                ? "存在需要复核的项目"
                : "Some checks need review"
              : counts.unassessed > 0
                ? zh
                  ? "部分项目未评估"
                  : "Some checks were not assessed"
                : zh
                  ? "检查未完整完成"
                  : "Checks are incomplete"}
        </strong>
        <span className="quality-assessment-counts">
          {filters
            .filter(
              (id): id is AssessmentOutcome =>
                id !== "all" && id !== "attention" && counts[id] > 0,
            )
            .map((id) => (
              <span key={id} className={"quality-outcome is-" + id}>
                {label(id)}: {counts[id]}
              </span>
            ))}
        </span>
      </div>
      <label>
        <span>{zh ? "显示哪些检查？" : "Which checks?"}</span>
        <select
          value={filter}
          onChange={(event) => onFilter(event.target.value as QualityFilter)}
        >
          {filters.map((value) => (
            <option key={value} value={value}>
              {label(value)} · {count(value)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
