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
export function App() {
  const [language, setLanguage] = useState<Language>(restoreLanguage),
    [storageWarning, setStorageWarning] = useState(false);
  const [view, setView] = useState<View>("home"),
    [reference, setReference] = useState<string | null>(null),
    [projectId, setProjectId] = useState<string | null>(null);
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
  const analysis = reference ? null : science.analysis;
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
  const urls = reference
    ? ["/references/" + reference + ".cif"]
    : job && comparison.length > 1
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
  function chooseJob(id: string) {
    select(id);
    setReference(null);
    setCandidateId(null);
    setCompared([]);
    setFocusResidue(null);
  }
  function showJob(id: string) {
    inspectJob(id);
    setView("home");
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
  }
  async function submit(value: Prediction, key: string) {
    changed(await api.submit({ ...value, project_id: projectId }, key));
  }
  function chooseReference(id: string) {
    setReference(id);
    setCompared([]);
    setCandidateId(null);
    setFocusResidue(null);
    setView("home");
  }
  const common = {
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
            <div hidden={view !== "home"}>
              <HomeWorkspace
                {...common}
                jobs={
                  projectId
                    ? jobs.filter((x) => x.request.project_id === projectId)
                    : jobs
                }
                onJob={chooseJob}
                connectionError={work.connectionError}
                onRefresh={refresh}
                reference={reference}
                onReference={chooseReference}
                onView={setView}
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
                  if (job) {
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
            {view !== "home" && (
              <UtilityViews
                {...common}
                analysis={science.analysis}
                view={view}
                jobs={jobs}
                loading={loading}
                onJob={inspectJob}
                onHome={() => {
                  setReference(null);
                  setView("home");
                }}
                projectError={science.projectError}
                reloadProjects={science.reloadProjects}
              />
            )}
            <footer className="studio-footer">
              OpenDDE Workbench ·{" "}
              {zh
                ? "本机计算，结果保存在本机"
                : "Local computation and storage"}
            </footer>
          </main>
        </div>
      </div>
    </IconContext.Provider>
  );
}
