import { useEffect, useRef, useState } from "react";
import IconContext from "@ant-design/icons/es/components/Context";
import { api, artifactUrl } from "./api";
import { persistLanguage, restoreLanguage, translator } from "./i18n";
import { useWorkbench, taskIdFromHash } from "./useWorkbench";
import { useScience } from "./studio/useScience";
import {
  Navigation,
  Header,
  viewTitle,
  coreToolForView,
  type View,
} from "./studio/Navigation";
import { HomeWorkspace } from "./studio/HomeWorkspace";
import { UtilityViews } from "./studio/UtilityViews";
import type { Job, Language, Prediction } from "./types";
import { ToolCenter } from "./operations/ToolCenter";
import { isPrediction } from "./operations/types";
import { useDeployment } from "./deployment/client";
import { DeploymentPanel } from "./deployment/DeploymentPanel";
import { AccountSettings } from "./studio/AccountSettings";
import { WorkspaceOverview } from "./studio/WorkspaceOverview";
import { Editors } from "./editors/Editors";
import { ResearchWorkspace } from "./research/ResearchWorkspace";
import type { ScientificObject } from "./research/types";
export function App() {
  const content = useRef<HTMLElement>(null);
  const deployment = useDeployment();
  const [editorObject, setEditorObject] = useState<ScientificObject | null>(
    null,
  );
  const [editorsOpened, setEditorsOpened] = useState(false);
  const [language, setLanguage] = useState<Language>(restoreLanguage),
    [storageWarning, setStorageWarning] = useState(false);
  const [view, setView] = useState<View>(() =>
      taskIdFromHash(location.hash) ? "home" : "tools",
    ),
    [projectId, setProjectId] = useState<string | null>(null);
  useEffect(() => {
    function navigate() {
      if (taskIdFromHash(window.location.hash)) {
        setView("home");
        setProjectId(null);
      }
    }
    window.addEventListener("hashchange", navigate);
    window.addEventListener("popstate", navigate);
    return () => {
      window.removeEventListener("hashchange", navigate);
      window.removeEventListener("popstate", navigate);
    };
  }, []);
  const [resultsVersion, setResultsVersion] = useState(0);
  useEffect(() => {
    if (view === "editors") setEditorsOpened(true);
  }, [view]);
  const [inputVersion, setInputVersion] = useState(0);
  const [candidateId, setCandidateId] = useState<string | null>(null),
    [compared, setCompared] = useState<string[]>([]),
    [focusResidue, setFocusResidue] = useState<{
      residue: string;
      nonce: number;
    } | null>(null);
  const [draft, setDraft] = useState<Prediction | null>(null),
    [submitted, setSubmitted] = useState<Job | null>(null);
  const work = useWorkbench(),
    { health, jobs, selected, select, detail, loading, refresh } = work;
  const job =
      jobs.find((x) => x.id === selected) ??
      (submitted?.id === selected ? submitted : null),
    science = useScience(job),
    t = translator(language),
    zh = language === "zh";
  const ready = Boolean(
    health?.engine.ready && health.worker_ready && !work.connectionError,
  );
  const analysis = science.analysis;
  const candidate =
    analysis?.candidates.find((x) => x.id === candidateId) ??
    (analysis
      ? [...analysis.candidates].sort(
          (a, b) =>
            (b.ranking_score ?? -Infinity) - (a.ranking_score ?? -Infinity),
        )[0]
      : undefined);
  const comparison =
    analysis?.candidates.filter((x) => compared.includes(x.id)) ?? [];
  const fallback =
    job?.status === "succeeded" && detail?.id === job.id
      ? detail.artifacts.find((x) => x.name.endsWith(".cif"))
      : null;
  const urls =
    job && comparison.length > 1
      ? comparison.map((x) =>
          artifactUrl(job.id, x.aligned_artifact ?? x.artifact),
        )
      : job && candidate
        ? [artifactUrl(job.id, candidate.artifact)]
        : job && fallback
          ? [artifactUrl(job.id, fallback.name)]
          : [];
  useEffect(() => {
    document.documentElement.lang = zh ? "zh-CN" : "en";
    document.title = viewTitle(view, language) + " · X-DDE";
  }, [language, view]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    content.current?.focus({ preventScroll: true });
  }, [view]);
  useEffect(() => {
    if (job && !isPrediction(job.request) && view === "home") setView("tasks");
  }, [job?.id, view]);
  function chooseJob(id: string) {
    select(id);
    setCandidateId(null);
    setCompared([]);
    setFocusResidue(null);
  }
  function showJob(id: string) {
    inspectJob(id);
    setResultsVersion((n) => n + 1);
    const value =
      jobs.find((j) => j.id === id) ??
      (submitted?.id === id ? submitted : null);
    setView(value && !isPrediction(value.request) ? "tasks" : "home");
  }
  function inspectJob(id: string) {
    const next = jobs.find((x) => x.id === id);
    if (next) setProjectId(next.request.project_id ?? null);
    chooseJob(id);
  }
  function chooseProject(id: string | null) {
    setProjectId(id);
    const next = jobs.find(
      (x) =>
        (!id || x.request.project_id === id) &&
        (view !== "home" || isPrediction(x.request)),
    );
    chooseJob(next?.id ?? "");
    if (!next) setSubmitted(null);
  }
  function chooseCandidate(id: string) {
    setCandidateId(id);
    setCompared([]);
    setFocusResidue(null);
  }
  function changed(next: Job) {
    setSubmitted(next);
    showJob(next.id);
    setProjectId(next.request.project_id ?? null);
    refresh();
    if (!isPrediction(next.request)) setView("tasks");
  }
  async function submit(value: Prediction, key: string) {
    const created = await api.submit({ ...value, project_id: projectId }, key);
    changed(created);
    return created;
  }
  function prepareDraft(value: Prediction) {
    chooseJob("");
    setDraft(value);
    setProjectId(value.project_id ?? null);
    setInputVersion((n) => n + 1);
    setView("home");
  }
  const common = {
    onDraft: prepareDraft,
    language,
    ready,
    health,
    job,
    detail,
    detailError: work.detailError,
    onChanged: changed,
    projects: science.projects,
    projectId,
    onProject: chooseProject,
    analysis,
    loadingAnalysis: science.loadingAnalysis,
    analysisError: science.analysisError,
    onRetry: science.reloadAnalysis,
    candidate,
    onCandidate: chooseCandidate,
  };
  return (
    <IconContext.Provider value={{ zeroRuntime: true }}>
      <div className="studio-app">
        <Navigation
          view={view}
          onView={setView}
          language={language}
          jobs={jobs}
        />
        <div className="studio-main">
          <Header
            view={view}
            language={language}
            jobs={jobs}
            onJob={showJob}
            storageWarning={storageWarning}
          />
          <main className="studio-content" ref={content} tabIndex={-1}>
            {view === "settings" && (
              <AccountSettings
                language={language}
                storageWarning={storageWarning}
                onLanguage={(value) => {
                  setLanguage(value);
                  setStorageWarning(!persistLanguage(value));
                }}
              />
            )}
            {view === "overview" && (
              <WorkspaceOverview
                language={language}
                jobs={jobs}
                health={health}
              />
            )}
            {view === "research" && (
              <ResearchWorkspace
                language={language}
                onCreated={changed}
                onJob={showJob}
                onEdit={(object) => {
                  setEditorObject(object);
                  setView("editors");
                }}
              />
            )}
            {view === "deployment" && (
              <DeploymentPanel
                data={deployment.data}
                error={deployment.error}
                refresh={deployment.refresh}
                language={language}
                onEditors={() => setView("editors")}
              />
            )}
            <div hidden={view !== "editors"}>
              {(editorsOpened || view === "editors") && (
                <Editors
                  initialObject={editorObject}
                  language={language}
                  deployment={deployment.data}
                  deploymentError={deployment.error}
                  onRetry={deployment.refresh}
                  onSetup={() => setView("deployment")}
                  onCreated={changed}
                />
              )}
            </div>
            {health?.queue_wait_reason && (
              <p className="notice" role="status">
                {zh ? "计算队列正在等待：" : "Compute queue is waiting: "}
                {health.queue_wait_reason}
              </p>
            )}
            <div hidden={view !== "home"}>
              <HomeWorkspace
                {...common}
                active={view === "home"}
                resultsVersion={resultsVersion}
                inputVersion={inputVersion}
                jobs={jobs.filter(
                  (x) =>
                    isPrediction(x.request) &&
                    (!projectId || x.request.project_id === projectId),
                )}
                onJob={chooseJob}
                connectionError={work.connectionError}
                onRefresh={refresh}
                compared={compared}
                onCompare={(ids) => {
                  setCompared(ids);
                  setFocusResidue(null);
                }}
                urls={urls}
                focusResidue={focusResidue}
                onResidue={(residue) => {
                  setCompared([]);
                  setFocusResidue({ residue, nonce: Date.now() });
                }}
                draft={draft}
                onReuse={() => {
                  if (job && isPrediction(job.request)) {
                    setProjectId(job.request.project_id ?? null);
                    setDraft({
                      ...job.request,
                      name:
                        job.request.name.slice(0, 72) +
                        (zh ? " · 副本" : " · copy"),
                    });
                  }
                }}
                onSubmit={submit}
              />
            </div>
            {(view === "tools" || coreToolForView(view)) && (
              <ToolCenter
                key={view}
                initialTool={coreToolForView(view) ?? null}
                onBrowse={view === "tools" ? undefined : () => setView("tools")}
                language={language}
                health={health}
                jobs={jobs}
                onCreated={changed}
                onPredict={() => {
                  chooseJob("");
                  setInputVersion((n) => n + 1);
                  setView("home");
                }}
                onDraft={prepareDraft}
              />
            )}
            {view !== "home" &&
              view !== "tools" &&
              !coreToolForView(view) &&
              view !== "deployment" &&
              view !== "editors" &&
              view !== "settings" &&
              view !== "overview" &&
              view !== "research" && (
                <UtilityViews
                  {...common}
                  analysis={science.analysis}
                  view={view}
                  jobs={jobs}
                  loading={loading}
                  connectionError={work.connectionError}
                  onRefresh={refresh}
                  onStart={() => setView("tools")}
                  onSetup={() => setView("deployment")}
                  onTasks={() => setView("tasks")}
                  onJob={chooseJob}
                  onHome={() => {
                    if (job && !isPrediction(job.request)) {
                      setView("tasks");
                      return;
                    }
                    setResultsVersion((n) => n + 1);
                    setView("home");
                  }}
                  projectError={science.projectError}
                  reloadProjects={science.reloadProjects}
                />
              )}
            <footer className="studio-footer">X-DDE · {t("footer")}</footer>
          </main>
        </div>
      </div>
    </IconContext.Provider>
  );
}
