import { useEffect, useRef, useState } from "react";
import { SearchOutlined, BellOutlined } from "@ant-design/icons";
import { historyChoiceLabel } from "../presentation/history-choice";
import type { Job, Language } from "../types";
import { viewTitle, type View } from "./navigation-model";
export function Header({
  view,
  language,
  jobs,
  onJob,
  storageWarning,
}: {
  view: View;
  language: Language;
  jobs: Job[];
  onJob(id: string): void;
  storageWarning: boolean;
}) {
  const zh = language === "zh";
  const [query, setQuery] = useState("");
  const header = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const notifications = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function close(event: PointerEvent) {
      if (!header.current?.contains(event.target as Node)) {
        setQuery("");
        if (notifications.current) notifications.current.open = false;
      }
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const matches = query.trim()
    ? jobs
        .filter((job) =>
          `${job.request.name} ${job.id}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
        )
        .slice(0, 8)
    : [];
  const problems = jobs
    .filter((job) => ["failed", "interrupted"].includes(job.status))
    .slice(0, 5);
  return (
    <header
      className="studio-topbar"
      ref={header}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        if (query) {
          setQuery("");
          search.current?.focus();
        }
        if (notifications.current?.open) {
          notifications.current.open = false;
          notifications.current.querySelector("summary")?.focus();
        }
      }}
    >
      <div className="page-context">
        <span className="page-context-signature" aria-hidden="true">
          AI · BIOPHARMA
        </span>
        <span>{viewTitle(view, language)}</span>
      </div>
      <div className="global-search">
        <SearchOutlined />
        <label className="sr-only" htmlFor="global-search">
          {zh ? "搜索任务" : "Search tasks"}
        </label>
        <input
          id="global-search"
          ref={search}
          type="search"
          value={query}
          aria-expanded={Boolean(query.trim())}
          aria-controls={query.trim() ? "task-search-results" : undefined}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={zh ? "搜索任务名称" : "Search tasks by name or ID"}
        />
        {query.trim() && (
          <div
            className="search-results"
            id="task-search-results"
            role="region"
            aria-label={zh ? "任务搜索结果" : "Task search results"}
          >
            {matches.length ? (
              matches.map((job, index) => (
                <button
                  key={job.id}
                  onClick={() => {
                    onJob(job.id);
                    setQuery("");
                  }}
                >
                  {historyChoiceLabel(
                    job.request.name,
                    index,
                    zh,
                    job.created_at,
                  )}
                </button>
              ))
            ) : (
              <p>{zh ? "没有匹配的任务" : "No matching task"}</p>
            )}
          </div>
        )}
      </div>
      <div className="top-actions">
        <details className="top-popover" ref={notifications}>
          <summary aria-label={zh ? "任务提醒" : "Task notifications"}>
            <BellOutlined />
            {problems.length > 0 && <span className="notification-dot" />}
          </summary>
          <div>
            <strong>{zh ? "需关注的任务" : "Tasks needing attention"}</strong>
            {problems.length ? (
              problems.map((job) => (
                <button
                  key={job.id}
                  onClick={() => {
                    onJob(job.id);
                    if (notifications.current)
                      notifications.current.open = false;
                  }}
                >
                  {job.request.name} · {job.status}
                </button>
              ))
            ) : (
              <p>{zh ? "目前没有失败任务" : "No failed tasks"}</p>
            )}
          </div>
        </details>
      </div>
      {storageWarning && (
        <div role="status" className="header-warning">
          {zh
            ? "浏览器无法记住语言选择。"
            : "Language preference could not be saved."}
        </div>
      )}
    </header>
  );
}
