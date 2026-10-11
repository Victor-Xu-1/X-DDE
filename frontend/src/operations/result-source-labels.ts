import type { Language } from "../types";
import { historyChoiceLabel } from "../presentation/history-choice";
import {
  historyKindLabel,
  type TaskHistoryItem,
} from "../studio/task-history-model";

/** Personal titles stay verbatim; fixed examples use confirmed case metadata. */
export function resultSourceTitle(
  item: TaskHistoryItem,
  scope: "research" | "examples",
  language: Language,
) {
  if (scope === "research") return item.job.request.name;
  const labels = (item.example_cases ?? []).map(
    (entry) => entry.label[language === "zh" ? 0 : 1],
  );
  return labels.length
    ? labels.join(" / ")
    : language === "zh"
      ? "历史参考结果"
      : "Historical reference result";
}

export function resultSourceLabel(
  item: TaskHistoryItem,
  scope: "research" | "examples",
  language: Language,
  index: number,
  duplicate: boolean,
) {
  const title = resultSourceTitle(item, scope, language);
  return [
    scope === "examples" || duplicate
      ? historyChoiceLabel(title, index, language === "zh", item.job.created_at)
      : title,
    historyKindLabel(item.capability_id, language),
  ].join(" · ");
}
