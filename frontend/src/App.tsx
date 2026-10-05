import "./presentation/result-layout.css";
import { useEffect, useRef, useState } from "react";
import IconContext from "@ant-design/icons/es/components/Context";
import { api, artifactUrl } from "./api";
import { persistLanguage, restoreLanguage, translator } from "./i18n";
import { useWorkbench, taskIdFromHash } from "./useWorkbench";
import { useScience } from "./studio/useScience";
import { Navigation } from "./studio/Navigation";
import { Header } from "./studio/Header";
import {
  viewTitle,
  toolForView,
  viewForTool,
  type View,
} from "./studio/navigation-model";
import { ModuleTaskPicker } from "./studio/ModuleTaskPicker";
import { PredictionResults } from "./studio/PredictionResults";
import { TaskWorkspace } from "./studio/TaskWorkspace";
import { WorkspaceTabs } from "./studio/WorkspaceTabs";
import { EnvironmentWorkspace } from "./studio/EnvironmentWorkspace";
import { HelpWorkspace } from "./studio/HelpWorkspace";
import { ProjectPanel } from "./studio/ProjectPanel";
import type { ToolId } from "./operations/catalog";
import "./design/research-navigation.css";
import "./design/module-surfaces.css";
import { workspaceTheme } from "./design/module-theme";
import { HomeWorkspace } from "./studio/HomeWorkspace";
import type { Job, Language, Prediction } from "./types";
import { ToolCenter } from "./operations/ToolCenter";
import { isPrediction } from "./operations/types";
import { useDeployment } from "./deployment/client";
import { InterfaceSettings } from "./studio/InterfaceSettings";
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
  const [researchOpened, setResearchOpened] = useState(false),
    [researchTab, setResearchTab] = useState("projects"),
    [entryRevision, setEntryRevision] = useState(0);
  const [language, setLanguage] = useState<Language>(restoreLanguage),
    [storageWarning, setStorageWarning] = useState(false);
  const [view, setView] = useState<View>(() =>
      taskIdFromHash(location.hash) ? "tasks" : "tools",
    ),
    [projectId, setProjectId] = useState<string | null>(null);
  useEffect(() => {
    function navigate() {
      if (taskIdFromHash(window.location.hash)) {
        setView("tasks");
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
  const [catalogueRevision, setCatalogueRevision] = useState(0);
  useEffect(() => {
    if (view === "research") setResearchOpened(true);
    if (view === "research" && researchTab === "editors")
      setEditorsOpened(true);
  }, [view, researchTab]);
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
      (work.selectedJob?.id === selected ? work.selectedJob : null) ??
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
    if (!content.current?.contains(document.activeElement))
      content.current?.focus({ preventScroll: true });
  }, [view]);

  function chooseJob(id: string) {
    select(id);
    setCandidateId(null);
    setCompared([]);
    setFocusResidue(null);
  }
  function showJob(id: string) {
    inspectJob(id);
    setResultsVersion((n) => n + 1);
    setView("tasks");
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
  function openTool(tool: ToolId | null) {
    chooseJob("");
    setDraft(null);
    setEntryRevision((n) => n + 1);
    if (tool === "predict") setInputVersion((n) => n + 1);
    setView(tool ? viewForTool(tool) : "tools");
  }
  function navigate(next: View) {
    const tool = toolForView(next);
    if (tool) {
      openTool(tool);
      return;
    }
    if (next === "tools") {
      setCatalogueRevision((n) => n + 1);
      openTool(null);
      return;
    }
    setView(next);
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
          onView={navigate}
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
          <main
            className="studio-content"
            ref={content}
            tabIndex={-1}
            data-module-theme={workspaceTheme(
              view,
              toolForView(view),
              job?.request,
            )}
          >
            {view === "settings" && (
              <InterfaceSettings
                language={language}
                storageWarning={storageWarning}
                onLanguage={(value) => {
                  setLanguage(value);
                  setStorageWarning(!persistLanguage(value));
                }}
              />
            )}
            <div hidden={view !== "research"}>
              {(researchOpened || view === "research") && (
                <WorkspaceTabs
                  label={zh ? "研究空间" : "Research workspace"}
                  value={researchTab}
                  onChange={setResearchTab}
                  tabs={[
                    { id: "projects", label: zh ? "项目" : "Projects" },
                    { id: "files", label: zh ? "研究文件" : "Research files" },
                    {
                      id: "editors",
                      label: zh ? "结构编辑" : "Structure editor",
                    },
                  ]}
                >
                  <div hidden={researchTab !== "projects"}>
                    <ProjectPanel
                      language={language}
                      projects={science.projects}
                      error={science.projectError}
                      active={projectId}
                      onChoose={(id) => {
                        chooseProject(id);
                        setView("tasks");
                      }}
                      onCreated={science.reloadProjects}
                    />
                  </div>
                  <div hidden={researchTab !== "files"}>
                    <ResearchWorkspace
                      language={language}
                      onCreated={changed}
                      onJob={showJob}
                      onEdit={(object) => {
                        setEditorObject(object);
                        setResearchTab("editors");
                      }}
                    />
                  </div>
                  <div hidden={researchTab !== "editors"}>
                    {(editorsOpened || researchTab === "editors") && (
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
                </WorkspaceTabs>
              )}
            </div>
            {view === "deployment" && (
              <EnvironmentWorkspace
                language={language}
                data={deployment.data}
                error={deployment.error}
                refresh={deployment.refresh}
                health={health}
                connectionError={work.connectionError}
                onReconnect={refresh}
              />
            )}
            {view === "help" && (
              <HelpWorkspace
                language={language}
                onStart={() => navigate("tools")}
              />
            )}
            {health?.queue_wait_reason && view === "tasks" && (
              <p className="notice" role="status">
                {zh
                  ? "计算资源暂不可用，已提交的任务会继续等待。"
                  : "Compute resources are unavailable; submitted tasks remain queued."}
              </p>
            )}
            <div hidden={view !== "home"}>
              <ModuleTaskPicker
                value="predict"
                language={language}
                onChange={openTool}
              />
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
            {(view === "tools" || (view !== "home" && toolForView(view))) && (
              <>
                {view !== "tools" && (
                  <ModuleTaskPicker
                    value={toolForView(view)!}
                    language={language}
                    onChange={openTool}
                  />
                )}
                <ToolCenter
                  selectedTool={view === "tools" ? null : toolForView(view)}
                  onSelectTool={openTool}
                  entryRevision={entryRevision}
                  catalogueRevision={catalogueRevision}
                  language={language}
                  health={health}
                  jobs={jobs}
                  onCreated={changed}
                  onDraft={prepareDraft}
                  projects={science.projects}
                  onOpenWorkspace={(project) => {
                    navigate("research");
                    setResearchTab("projects");
                    setProjectId(project?.id ?? null);
                  }}
                />
              </>
            )}
            {view === "tasks" && (
              <TaskWorkspace
                {...common}
                jobs={jobs}
                loading={loading}
                connectionError={work.connectionError}
                onRefresh={refresh}
                onStart={() => navigate("tools")}
                onJob={chooseJob}
                projectId={projectId}
                onProject={chooseProject}
                onDraft={prepareDraft}
                prediction={
                  <PredictionResults
                    {...common}
                    urls={urls}
                    compared={compared}
                    onCompare={(ids) => {
                      setCompared(ids);
                      setFocusResidue(null);
                    }}
                    focusResidue={focusResidue}
                    onResidue={(residue) => {
                      setCompared([]);
                      setFocusResidue({ residue, nonce: Date.now() });
                    }}
                  />
                }
              />
            )}
          </main>
        </div>
      </div>
    </IconContext.Provider>
  );
}
