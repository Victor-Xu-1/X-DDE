import type { Job, Language } from "../types";
import type { TaskHistoryPage } from "../studio/task-history-model";
import { historyKindLabel } from "../studio/task-history-model";
import { historyChoiceLabel, nameCounts } from "../presentation/history-choice";

export function ResultTaskSelect({
  language,
  data,
  selected,
  loading,
  page,
  onPage,
  onSelect,
}: {
  language: Language;
  data: TaskHistoryPage | null;
  selected: Job | null;
  loading: boolean;
  page: number;
  onPage(page: number): void;
  onSelect(job: Job | null): void;
}) {
  const zh = language === "zh",
    items = data?.items ?? [],
    counts = nameCounts(items.map((item) => item.job.request.name));
  return (
    <>
      <label className="field">
        {zh ? "来源任务" : "Source task"}
        <select
          value={selected?.id ?? ""}
          disabled={loading}
          onChange={(event) =>
            onSelect(
              items.find((item) => item.job.id === event.target.value)?.job ??
                (selected?.id === event.target.value ? selected : null),
            )
          }
        >
          <option value="">
            {zh ? "选择已完成任务" : "Choose a completed task"}
          </option>
          {items.map(({ job, capability_id }, index) => (
            <option key={job.id} value={job.id}>
              {[
                (counts.get(job.request.name) ?? 0) > 1
                  ? historyChoiceLabel(
                      job.request.name,
                      page * 20 + index,
                      zh,
                      job.created_at,
                    )
                  : job.request.name,
                historyKindLabel(capability_id, language),
              ].join(" · ")}
            </option>
          ))}
          {selected && !items.some((item) => item.job.id === selected.id) && (
            <option value={selected.id}>
              {zh ? "当前选择：" : "Current selection: "}
              {selected.request.name}
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
