import { useEffect, useState } from "react";
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
  const [reload, setReload] = useState(0);
  const [analysisRevision, setAnalysisRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api
      .projects(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setProjects(data);
          setProjectError("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setProjectError(String(error));
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
    reloadProjects: () => setReload((value) => value + 1),
    reloadAnalysis: () => setAnalysisRevision((value) => value + 1),
  };
}
