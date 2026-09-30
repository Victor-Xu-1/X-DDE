import { useEffect, useState } from "react";
import IconContext from "@ant-design/icons/es/components/Context";
import { api, artifactUrl } from "./api";
import { persistLanguage, restoreLanguage, translator } from "./i18n";
import { useWorkbench } from "./useWorkbench";
import { useScience } from "./studio/useScience";
import { Navigation, Header, type View } from "./studio/Navigation";
import { HomeWorkspace } from "./studio/HomeWorkspace";
import { UtilityViews } from "./studio/UtilityViews";
import type { Job, Language, Prediction } from "./types";
import { ToolCenter } from "./operations/ToolCenter";
import { isPrediction } from "./operations/types";
import { useDeployment } from "./deployment/client";
import { DeploymentPanel } from "./deployment/DeploymentPanel";
import { Editors } from "./editors/Editors";
export function App() {
  const deployment = useDeployment();
  const [editorsOpened, setEditorsOpened] = useState(false);
  const [language, setLanguage] = useState<Language>(restoreLanguage),
    [storageWarning, setStorageWarning] = useState(false);
  const [view, setView] = useState<View>(() =>
      location.hash.startsWith("#task=") ? "home" : "tools",
    ),
    [projectId, setProjectId] = useState<string | null>(null);
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
    document.title = t("workspace") + " · OpenDDE";
  }, [language]);
  useEffect(() => {
    if (job && !isPrediction(job.request))
      setView((current) => (current === "home" ? "tasks" : current));
  }, [job?.id]);
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
    const next = jobs.find((x) => !id || x.request.project_id === id);
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
    changed(await api.submit({ ...value, project_id: projectId }, key));
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
          gpu={health?.engine.gpu ?? undefined}
          free={health?.free_disk_gib}
          total={health?.disk_total_gib}
        />
        <div className="studio-main">
          <Header
            language={language}
            onLanguage={(value) => {
              setLanguage(value);
              setStorageWarning(!persistLanguage(value));
            }}
            jobs={jobs}
            onJob={showJob}
            onView={setView}
            storageWarning={storageWarning}
          />
          <main className="studio-content">
            {view !== "deployment" &&
              deployment.data &&
              !deployment.data.installed.compute && (
                <aside className="onboarding-banner">
                  <div>
                    <strong>
                      {zh ? "让工作台准备就绪" : "Prepare your workspace"}
                    </strong>
                    <p>
                      {zh
                        ? "先安装编辑器即可画分子、看结构；计算任务需要相应环境与模型。"
                        : "Install editors to sketch and explore. Scientific tasks need their compute environment and models."}
                    </p>
                  </div>
                  <button onClick={() => setView("deployment")}>
                    {zh ? "安装与组件 →" : "Installation & components →"}
                  </button>
                </aside>
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
                  language={language}
                  deployment={deployment.data}
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
            {view === "tools" && (
              <ToolCenter
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
              view !== "deployment" &&
              view !== "editors" && (
                <UtilityViews
                  {...common}
                  analysis={science.analysis}
                  view={view}
                  jobs={jobs}
                  loading={loading}
                  onJob={inspectJob}
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
            <footer className="studio-footer">
              OpenDDE Workbench ·{" "}
              {zh
                ? "OpenDDE · Harness · RDKit，按实际能力提供研究工具"
                : "Research tools powered by OpenDDE, Harness and RDKit"}
            </footer>
          </main>
        </div>
      </div>
    </IconContext.Provider>
  );
}
