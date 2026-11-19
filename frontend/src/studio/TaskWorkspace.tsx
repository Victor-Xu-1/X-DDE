import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SearchOutlined } from "@ant-design/icons";
import {
  InputActionScope,
  useInputActionScope,
} from "../guided/InputActionScope";
import { TaskBackendControl } from "../utilities/TaskBackendControl";
import { PrimaryBackendScope } from "../utilities/backend-control-scope";
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
import { terminal } from "../types";
import { predictionMethodId } from "../presentation/PredictionResultHeader";
import { TaskWorkspaceSelectionState } from "./TaskWorkspaceSelectionState";
import { EmptyState } from "./EmptyState";
import { TaskHistoryToolbar } from "./TaskHistoryToolbar";
import { TaskHistoryFilters } from "./TaskHistoryFilters";
import { TaskHistoryList } from "./TaskHistoryList";
import { useTaskHistory } from "./useTaskHistory";
import { historyDateError } from "./task-history-dates";
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
  retryAvailable?: boolean;
  selected?: string;
  selectedError?: Error | null;
  selectedLoading?: boolean;
  projects: Project[];
  projectId: string | null;
  onRefresh(): void;
  onJob(id: string): void;
  onChanged(job: Job): void;
  onStart(tool?: ToolId): void;
  onProject(id: string | null): void;
  onDraft?(request: Prediction): void;
  renderPrediction(onHistory: () => void, headerActions: ReactNode): ReactNode;
}
export function TaskWorkspace(props: Props) {
  const scope = useInputActionScope();
  return scope ? (
    <TaskWorkspaceContent {...props} />
  ) : (
    <InputActionScope>
      <TaskWorkspaceContent {...props} />
    </InputActionScope>
  );
}

function TaskWorkspaceContent(p: Props) {
  const zh = p.language === "zh";
  const scope = useInputActionScope()!;
  const restored = taskHistoryRoute(window.location.hash);
  const initialRoute = useRef(
    restored?.module === p.scopedModule ? restored : null,
  );
  const taskJob =
    p.job &&
    moduleForKind(kindForJob(p.job)) === p.scopedModule &&
    (!p.projectId || p.job.request.project_id === p.projectId)
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
  const [startDate, setStartDate] = useState(
    initialRoute.current?.startDate ?? "",
  );
  const [endDate, setEndDate] = useState(initialRoute.current?.endDate ?? "");
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
      setStartDate(route.startDate ?? "");
      setEndDate(route.endDate ?? "");
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
        {
          module,
          type,
          status,
          query,
          page,
          project: p.projectId,
          startDate,
          endDate,
        },
        taskIdFromHash(window.location.hash),
      ),
    );
  }, [
    module,
    type,
    status,
    query,
    page,
    p.projectId,
    taskJob?.id,
    startDate,
    endDate,
  ]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      if (query !== search) setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (!taskJob) {
      setChoosing(true);
      return;
    }
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
    setStartDate("");
    setEndDate("");
    setPage(0);
    setChoosing(false);
  }, [taskJob?.id, p.scopedModule]);
  const historyTitle = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef(false);
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
    startDate,
    endDate,
  });
  const invalidDates = historyDateError({ startDate, endDate });
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
  function returnToHistory() {
    if (scope.isLocked("submission")) return;
    returnFocus.current = true;
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
  const blank = history.data?.total === 0 && !history.error;
  const resultView =
    !currentJob || choosing
      ? "history"
      : terminal(currentJob.status) && predictionMethodId(currentJob.request)
        ? "prediction"
        : "detail";
  useLayoutEffect(() => {
    if (resultView === "history" && returnFocus.current) {
      returnFocus.current = false;
      historyTitle.current?.focus();
    }
  }, [resultView]);
  const inlineHeader =
    resultView === "detail" &&
    currentJob &&
    !predictionMethodId(currentJob.request);
  const resultBackendScope = currentJob
    ? { operations: [currentJob.request.operation ?? "predict"] }
    : null;
  const resultBackend = resultBackendScope && (
    <TaskBackendControl
      language={p.language}
      scope={resultBackendScope}
      placement="result"
    />
  );
  const historyToolbar = (
    <TaskHistoryToolbar
      language={p.language}
      module={module}
      projectName={projectName}
      hasProject={Boolean(p.projectId)}
      view={resultView}
      headingRef={historyTitle}
      count={history.error ? undefined : history.data?.total}
      onHistory={returnToHistory}
      onRefresh={refresh}
      onStart={p.onStart}
      onClearProject={() => {
        if (!scope.isLocked("submission")) p.onProject(null);
      }}
    />
  );
  const filtered =
    type !== "all" ||
    status !== "all" ||
    Boolean(query.trim()) ||
    Boolean(startDate || endDate);
  const showFilters =
    filtered || availableKinds.length > 0 || Boolean(history.data?.total);
  function clearFilters() {
    historyTitle.current?.focus();
    changeFilter(() => {
      setType("all");
      setStatus("all");
      setQuery("");
      setSearch("");
      setStartDate("");
      setEndDate("");
    });
  }
  return (
    <section className="utility-page task-history-workspace">
      <h1 className="sr-only">
        {historyModuleLabel(module, p.language)} ·{" "}
        {zh ? "任务结果" : "Task results"}
      </h1>
      {!inlineHeader && historyToolbar}
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
      {p.selected && !p.job ? (
        <TaskWorkspaceSelectionState
          language={p.language}
          error={p.selectedError ?? null}
          loading={Boolean(p.selectedLoading)}
          onRetry={p.onRefresh}
          historyHref={taskHistoryHash({
            module,
            type,
            status,
            query,
            page,
            project: p.projectId,
            startDate,
            endDate,
          })}
        />
      ) : (
        <div className="task-page-content">
          {resultView === "history" && (
            <div className="task-history-list">
              {showFilters && (
                <TaskHistoryFilters
                  language={p.language}
                  type={type}
                  status={status}
                  query={query}
                  kinds={availableKinds}
                  onType={(value) => changeFilter(() => setType(value))}
                  onStatus={(value) => changeFilter(() => setStatus(value))}
                  onQuery={(value) => changeFilter(() => setQuery(value))}
                  startDate={startDate}
                  endDate={endDate}
                  onStartDate={(value) =>
                    changeFilter(() => setStartDate(value))
                  }
                  onEndDate={(value) => changeFilter(() => setEndDate(value))}
                  onClear={clearFilters}
                  filtered={filtered}
                />
              )}
              {invalidDates && (
                <div className="error-box" role="alert">
                  {zh
                    ? "请选择有效的开始与结束日期；开始日期不能晚于结束日期。"
                    : "Choose valid dates. The start date cannot follow the end date."}
                </div>
              )}
              {history.loading && (
                <p className="notice" role="status">
                  {zh ? "正在读取任务…" : "Loading tasks…"}
                </p>
              )}
              {history.data && history.data.items.length > 0 && (
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
              {blank && (
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
                />
              )}
            </div>
          )}
          {currentJob && resultView !== "history" && (
            <PrimaryBackendScope.Provider value={resultBackendScope}>
              <div className="task-result-content">
                {currentJob.status === "succeeded" &&
                isPrediction(currentJob.request) ? (
                  p.renderPrediction(returnToHistory, resultBackend)
                ) : (
                  <TaskDetail
                    key={currentJob.id}
                    language={p.language}
                    job={currentJob}
                    detail={currentDetail}
                    failed={p.detailError}
                    retryAvailable={p.retryAvailable}
                    onPredictionHistory={returnToHistory}
                    headerNavigation={inlineHeader ? historyToolbar : undefined}
                    headerActions={resultBackend}
                    onChange={p.onChanged}
                    onDraft={p.onDraft}
                  />
                )}
              </div>
            </PrimaryBackendScope.Provider>
          )}
        </div>
      )}
    </section>
  );
}
