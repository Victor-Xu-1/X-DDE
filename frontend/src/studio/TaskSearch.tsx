import { useEffect, useRef, useState } from "react";
import { SearchOutlined } from "@ant-design/icons";
import { historyChoiceLabel } from "../presentation/history-choice";
import type { Job, Language } from "../types";

export function TaskSearch({
  jobs,
  language,
  onJob,
}: {
  jobs: Job[];
  language: Language;
  onJob(id: string): void;
}) {
  const zh = language === "zh";
  const [query, setQuery] = useState(""),
    [expanded, setExpanded] = useState(false);
  const container = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    results = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expanded) search.current?.focus();
  }, [expanded]);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) {
        setQuery("");
        setExpanded(false);
      }
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
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
  function close() {
    setQuery("");
    setExpanded(false);
    if (trigger.current && getComputedStyle(trigger.current).display !== "none")
      trigger.current.focus();
    else search.current?.focus();
  }
  return (
    <div
      className="task-search"
      ref={container}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
          return;
        }
        const buttons = Array.from(
          results.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
        );
        const current = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (
          event.key === "ArrowDown" &&
          (document.activeElement === search.current || current >= 0)
        ) {
          event.preventDefault();
          buttons[(current + 1) % buttons.length]?.focus();
        } else if (event.key === "ArrowUp" && current >= 0) {
          event.preventDefault();
          if (current === 0) search.current?.focus();
          else buttons[current - 1]?.focus();
        }
      }}
    >
      <button
        type="button"
        className="compact-search-trigger"
        ref={trigger}
        aria-label={zh ? "搜索任务" : "Search tasks"}
        aria-expanded={expanded}
        aria-controls={expanded ? "global-search-panel" : undefined}
        onClick={() => setExpanded(true)}
      >
        <SearchOutlined />
      </button>
      <div
        id="global-search-panel"
        className={"global-search" + (expanded ? " is-expanded" : "")}
      >
        <SearchOutlined aria-hidden="true" />
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
          onChange={(event) => setQuery(event.target.value)}
          placeholder={zh ? "搜索任务名称" : "Search tasks by name or ID"}
        />
        <button
          type="button"
          className="compact-search-close"
          aria-label={zh ? "关闭任务搜索" : "Close task search"}
          onClick={close}
        >
          {zh ? "取消" : "Cancel"}
        </button>
        {query.trim() && (
          <div
            className="search-results"
            ref={results}
            id="task-search-results"
            role="region"
            aria-label={zh ? "任务搜索结果" : "Task search results"}
          >
            {matches.length ? (
              matches.map((job, index) => (
                <button
                  type="button"
                  key={job.id}
                  onClick={() => {
                    setQuery("");
                    setExpanded(false);
                    onJob(job.id);
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
              <p role="status">{zh ? "没有匹配的任务" : "No matching task"}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
