import { translator } from "../i18n";
import { resultSourceTitle } from "../operations/result-source-labels";
import type { Language } from "../types";
import {
  historyKindLabel,
  historyPageSize,
  type TaskHistoryPage,
} from "./task-history-model";

export function TaskHistoryList({
  language,
  data,
  selected,
  page,
  loading,
  onJob,
  onPage,
}: {
  language: Language;
  data: TaskHistoryPage;
  selected: string | undefined;
  page: number;
  loading: boolean;
  onJob(id: string): void;
  onPage(page: number): void;
}) {
  const zh = language === "zh",
    t = translator(language);
  const pages = Math.max(1, Math.ceil(data.total / historyPageSize));
  return (
    <>
      <div className="task-history-table-wrap">
        <table className="task-history-table">
          <thead>
            <tr>
              <th>{zh ? "任务" : "Task"}</th>
              <th>{zh ? "任务类型" : "Task type"}</th>
              <th>{zh ? "状态" : "Status"}</th>
              <th>{zh ? "创建时间" : "Created"}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => {
              const { job, capability_id } = item;
              const date = new Date(job.created_at);
              const when = Number.isFinite(date.getTime())
                ? date.toLocaleString(zh ? "zh-CN" : "en-GB", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—";
              return (
                <tr key={job.id} data-selected={job.id === selected}>
                  <td>
                    <button
                      type="button"
                      aria-pressed={job.id === selected}
                      onClick={() => onJob(job.id)}
                    >
                      {resultSourceTitle(
                        item,
                        (item.origin ?? "research") === "research"
                          ? "research"
                          : "examples",
                        language,
                      )}
                    </button>
                  </td>
                  <td>{historyKindLabel(capability_id, language)}</td>
                  <td>
                    <span className={"status " + job.status}>
                      {t(job.status)}
                    </span>
                  </td>
                  <td>
                    <time dateTime={job.created_at}>{when}</time>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav
        className="task-history-pagination"
        aria-label={zh ? "任务分页" : "Task pages"}
      >
        <span>
          {data.total ? data.offset + 1 : 0}–
          {Math.min(data.offset + data.limit, data.total)} / {data.total}
        </span>
        <div>
          <button
            type="button"
            disabled={loading || page === 0}
            onClick={() => onPage(page - 1)}
          >
            {zh ? "上一页" : "Previous"}
          </button>
          <span>
            {page + 1} / {pages}
          </span>
          <button
            type="button"
            disabled={loading || page + 1 >= pages}
            onClick={() => onPage(page + 1)}
          >
            {zh ? "下一页" : "Next"}
          </button>
        </div>
      </nav>
    </>
  );
}
