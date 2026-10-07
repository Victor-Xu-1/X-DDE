import { useEffect, useState } from "react";
import { artifactUrl } from "../api";
import {
  chartArtifacts,
  validateChartDocument,
  type ChartDocuments,
} from "./chart-documents";
import type { DatasetArtifact } from "./types";

export function useChartDocuments(jobId: string, artifacts: DatasetArtifact[]) {
  const files = chartArtifacts(artifacts);
  const key = JSON.stringify([
    jobId,
    files.map((file) => [file.role, file.name, file.sha256]),
  ]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    documents: ChartDocuments;
    status: "loading" | "ready" | "error";
  }>({ key: "", documents: {}, status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(30000),
    ]);
    const [study, entries] = JSON.parse(key) as [
      string,
      [string, string, string][],
    ];
    setState({ key, documents: {}, status: "loading" });
    void Promise.all(
      entries.map(async ([role, name]) => {
        const response = await fetch(artifactUrl(study, name), {
          signal,
        });
        if (!response.ok) throw new Error("Chart unavailable");
        return [
          role,
          validateChartDocument(role, await response.json()),
        ] as const;
      }),
    )
      .then((entries) => {
        if (!controller.signal.aborted)
          setState({
            key,
            documents: Object.fromEntries(entries),
            status: "ready",
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, documents: {}, status: "error" });
      });
    return () => controller.abort();
  }, [key, attempt]);
  return {
    documents: state.key === key ? state.documents : {},
    status: state.key === key ? state.status : "loading",
    available: files.length > 0,
    retry: () => setAttempt((value) => value + 1),
  };
}
