import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Analysis, Job, Project } from "../types";
import { isPrediction } from "../operations/types";

export function useScience(job: Job | null) {
  const [result, setResult] = useState<{ id: string; data: Analysis } | null>(
    null,
  );
  const analysis = result?.id === job?.id ? (result?.data ?? null) : null;
  const [analysisError, setAnalysisError] = useState("");
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectError, setProjectError] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);
  const projectRevision = useRef(0);
  const projectReceipts = useRef(new Map<string, Project>());
  const [reload, setReload] = useState(0);
  const [analysisRevision, setAnalysisRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const revision = projectRevision.current;
    const current = () =>
      !controller.signal.aborted && revision === projectRevision.current;
    void api
      .projects(controller.signal)
      .then((data) => {
        if (current()) {
          // Keep confirmed creations until a fresh list includes their IDs.
          for (const project of data)
            projectReceipts.current.delete(project.id);
          setProjects(
            [...projectReceipts.current.values()].reverse().concat(data),
          );
          setProjectError("");
        }
      })
      .catch((error) => {
        if (current()) setProjectError(String(error));
      })
      .finally(() => {
        if (current()) setLoadingProjects(false);
      });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setAnalysisError("");
    setLoadingAnalysis(false);
    if (job?.status !== "succeeded" || !isPrediction(job.request))
      return () => controller.abort();
    setLoadingAnalysis(true);
    void api
      .analysis(job.id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ id: job.id, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setAnalysisError(String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingAnalysis(false);
      });
    return () => controller.abort();
  }, [job?.id, job?.status, analysisRevision]);
  return {
    analysis,
    analysisError,
    loadingAnalysis,
    projects,
    projectError,
    loadingProjects,
    reloadProjects: (project?: Project) => {
      // Invalidate older reads immediately, before the next effect cleanup.
      projectRevision.current += 1;
      if (project) {
        projectReceipts.current.set(project.id, project);
        setProjects((items) => [
          project,
          ...items.filter((p) => p.id !== project.id),
        ]);
      }
      setLoadingProjects(true);
      setReload((value) => value + 1);
    },
    reloadAnalysis: () => setAnalysisRevision((value) => value + 1),
  };
}
