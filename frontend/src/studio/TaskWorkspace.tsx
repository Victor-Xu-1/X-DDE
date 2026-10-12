import { useEffect, useRef, useState, type ReactNode } from "react";
import { SearchOutlined } from "@ant-design/icons";
import { TaskDetail } from "../TaskDetail";
import { isPrediction } from "../operations/types";
import type { ToolId } from "../operations/catalog";
import type {
  Detail,
  Job,
  Language,
  Project,
  Prediction,
  Status,
} from "../types";
import { EmptyState } from "./EmptyState";
import { TaskHistoryToolbar } from "./TaskHistoryToolbar";
import { TaskHistoryFilters } from "./TaskHistoryFilters";
import { TaskHistoryList } from "./TaskHistoryList";
import { useTaskHistory } from "./useTaskHistory";
import { taskIdFromHash } from "../useWorkbench";
import { taskHistoryHash, taskHistoryRoute } from "./task-history-route";
import {
  kindForJob,
  kindsForModule,
  moduleForKind,
  historyModuleLabel,
  type HistoryModule,
} from "./task-history-model";
import "./task-history.css";

interface Props {
  scopedModule: HistoryModule;
  language: Language;
  job: Job | null;
  detail: Detail | null;
  detailError: boolean;
  projects: Project[];
  projectId: string | null;
  onRefresh(): void;
  onJob(id: string): void;
  onChanged(job: Job): void;
  onStart(tool?: ToolId): void;
  onProject(id: string | null): void;
  onDraft?(request: Prediction): void;
  prediction: ReactNode;
}
export function TaskWorkspace(p: Props) {
  const zh = p.language === "zh";
  const restored = taskHistoryRoute(window.location.hash);
  const initialRoute = useRef(restored?.module === p.scopedModule ? restored : null);
  const taskJob =
    p.job && moduleForKind(kindForJob(p.job)) === p.scopedModule
      && (!p.projectId || p.job.request.project_id === p.projectId)
      ? p.job
      : null;
  const module = p.scopedModule;
  const [type, setType] = useState(initialRoute.current?.type ?? "all");
  const [status, setStatus] = useState<Status | "all">(
    initialRoute.current?.status ?? "all",
  );
  const [query, setQuery] = useState(initialRoute.current?.query ?? ""),
    [search, setSearch] = useState(initialRoute.current?.query ?? "");
  const [page, setPage] = useState(initialRoute.current?.page ?? 0),
    [choosing, setChoosing] = useState(!taskJob);
  const chosenHere = useRef<string | null>(
    initialRoute.current ? taskIdFromHash(window.location.hash) : null,
  );
  useEffect(() => {
    function restore() {
      const route = taskHistoryRoute(window.location.hash);
      if (!route || route.module !== module) return;
      setType(route.type);
      setStatus(route.status);
      setQuery(route.query);
      setSearch(route.query);
      setPage(route.page);
      chosenHere.current = taskIdFromHash(window.location.hash);
      setChoosing(!chosenHere.current);
    }
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, [p.scopedModule]);
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      taskHistoryHash(
        { module, type, status, query: search, page, project: p.projectId },
        taskIdFromHash(window.location.hash),
      ),
    );
  }, [module, type, status, search, page, p.projectId]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      if (query !== search) setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (!taskJob) return;
    if (
      chosenHere.current === taskJob.id &&
      module === moduleForKind(kindForJob(taskJob))
    ) {
      chosenHere.current = null;
      setChoosing(false);
      return;
    }
    setType("all");
    setStatus("all");
    setQuery("");
    setSearch("");
    setPage(0);
    setChoosing(false);
  }, [taskJob?.id, p.scopedModule]);
  const lastProject = useRef(p.projectId);
  useEffect(() => {
    if (lastProject.current !== p.projectId) setPage(0);
    lastProject.current = p.projectId;
  }, [p.projectId]);
  const history = useTaskHistory({
    module,
    type,
    status,
    query: search,
    page,
    project: p.projectId,
  });
  useEffect(() => {
    if (
      history.data &&
      page > 0 &&
      page * history.data.limit >= history.data.total
    )
      setPage(
        Math.max(0, Math.ceil(history.data.total / history.data.limit) - 1),
      );
  }, [history.data, page]);
  const projectName = p.projects.find(
    (project) => project.id === p.projectId,
  )?.name;
  const currentJob =
    taskJob && module === moduleForKind(kindForJob(taskJob)) ? taskJob : null;
  const currentDetail =
    currentJob && p.detail?.id === currentJob.id ? p.detail : null;
  function changeFilter(action: () => void) {
    action();
    setPage(0);
    setChoosing(true);
    p.onJob("");
  }
  function refresh() {
    history.refresh();
    p.onRefresh();
  }
  const availableKinds = module
    ? kindsForModule(module).filter(
        (kind) => history.counts[kind]?.total || type === kind,
      )
    : [];
  const blank = !currentJob && !history.loading && history.data?.total === 0;
  const filtered = type !== "all" || status !== "all" || Boolean(query.trim());
  return (
    <section className="utility-page task-history-workspace">
      <h1 className="sr-only">{historyModuleLabel(module, p.language)} · {zh ? "任务结果" : "Task results"}</h1>
      <TaskHistoryToolbar
        language={p.language}
        module={module}
        projectName={projectName}
        hasProject={Boolean(p.projectId)}
        onRefresh={refresh}
        onStart={p.onStart}
        onClearProject={() => p.onProject(null)}
      />
      {history.error && (
        <div className="error-box" role="alert">
          {zh
            ? "暂时无法读取最新任务，请重新连接。"
            : "Unable to load the latest tasks. Please reconnect."}
          <button type="button" onClick={refresh}>
            {zh ? "重新连接" : "Reconnect"}
          </button>
        </div>
      )}
      {
        <div className="task-page-content">
          <details
            className="task-picker"
            open={choosing}
            onToggle={(event) => setChoosing(event.currentTarget.open)}
          >
            <summary>
              {zh ? "任务列表" : "Task list"}
              {history.data && <span> · {history.data.total}</span>}
            </summary>
            <TaskHistoryFilters
              language={p.language}
              type={type}
              status={status}
              query={query}
              kinds={availableKinds}
              onType={(value) => changeFilter(() => setType(value))}
              onStatus={(value) => changeFilter(() => setStatus(value))}
              onQuery={(value) => changeFilter(() => setQuery(value))}
            />
            {history.loading && (
              <p className="notice" role="status">
                {zh ? "正在读取任务…" : "Loading tasks…"}
              </p>
            )}
            {history.data && (
              <TaskHistoryList
                language={p.language}
                data={history.data}
                selected={currentJob?.id}
                page={page}
                loading={history.loading}
                onPage={setPage}
                onJob={(id) => {
                  chosenHere.current = id;
                  p.onJob(id);
                  setChoosing(false);
                }}
              />
            )}
            {blank && !history.error && (
              <EmptyState
                icon={<SearchOutlined />}
                title={
                  filtered
                    ? zh
                      ? "没有匹配的任务"
                      : "No matching tasks"
                    : zh
                      ? "这个模块还没有任务"
                      : "No tasks in this module yet"
                }
                description={
                  filtered
                    ? zh
                      ? "调整筛选，或清除筛选查看模块内任务。"
                      : "Adjust or clear filters to see tasks in this module."
                    : zh
                      ? "新建任务后，在这里查看进度与结果。"
                      : "Create a task to track progress and inspect results here."
                }
              >
                {filtered && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      changeFilter(() => {
                        setType("all");
                        setStatus("all");
                        setQuery("");
                        setSearch("");
                      })
                    }
                  >
                    {zh ? "清除筛选" : "Clear filters"}
                  </button>
                )}
              </EmptyState>
            )}
          </details>
          {currentJob && (
            <div className="task-result-content">
              {currentJob.status === "succeeded" &&
              isPrediction(currentJob.request) ? (
                p.prediction
              ) : (
                <TaskDetail
                  key={currentJob.id}
                  language={p.language}
                  job={currentJob}
                  detail={currentDetail}
                  failed={p.detailError}
                  onChange={p.onChanged}
                  onDraft={p.onDraft}
                />
              )}
            </div>
          )}
        </div>
      }
    </section>
  );
}
