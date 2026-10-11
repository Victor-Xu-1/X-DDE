import type { Language } from "../types";
import type {
  TaskHistoryItem,
  TaskHistoryPage,
} from "../studio/task-history-model";
import { nameCounts } from "../presentation/history-choice";
import { resultSourceLabel, resultSourceTitle } from "./result-source-labels";

export function ResultTaskSelect({
  language,
  data,
  selected,
  scope,
  loading,
  page,
  onPage,
  onSelect,
}: {
  language: Language;
  data: TaskHistoryPage | null;
  selected: TaskHistoryItem | null;
  scope: "research" | "examples";
  loading: boolean;
  page: number;
  onPage(page: number): void;
  onSelect(item: TaskHistoryItem | null): void;
}) {
  const zh = language === "zh",
    items = data?.items ?? [],
    counts = nameCounts(
      items.map((item) => resultSourceTitle(item, scope, language)),
    );
  return (
    <>
      <label className="field result-source-task">
        {zh ? "来源任务" : "Source task"}
        <select
          value={selected?.job.id ?? ""}
          disabled={loading}
          onChange={(event) =>
            onSelect(
              items.find((item) => item.job.id === event.target.value) ??
                (selected?.job.id === event.target.value ? selected : null),
            )
          }
        >
          <option value="">
            {zh ? "选择已完成任务" : "Choose a completed task"}
          </option>
          {items.map((item, index) => (
            <option key={item.job.id} value={item.job.id}>
              {resultSourceLabel(
                item,
                scope,
                language,
                page * 20 + index,
                (counts.get(resultSourceTitle(item, scope, language)) ?? 0) > 1,
              )}
            </option>
          ))}
          {selected &&
            !items.some((item) => item.job.id === selected.job.id) && (
              <option value={selected.job.id}>
                {zh ? "当前选择：" : "Current selection: "}
                {resultSourceTitle(selected, scope, language)}
              </option>
            )}
        </select>
      </label>
      {data && (data.total > data.limit || page > 0) && (
        <nav
          className="result-source-pages"
          aria-label={zh ? "结果来源分页" : "Result source pages"}
        >
          <span>
            {data.total ? data.offset + 1 : 0}–
            {Math.min(data.offset + data.limit, data.total)} / {data.total}
          </span>
          <button
            type="button"
            className="secondary-button"
            disabled={loading || page === 0}
            onClick={() => onPage(page - 1)}
          >
            {zh ? "上一页" : "Previous page"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={loading || data.offset + data.limit >= data.total}
            onClick={() => onPage(page + 1)}
          >
            {zh ? "下一页" : "Next page"}
          </button>
        </nav>
      )}
    </>
  );
}
