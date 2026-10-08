import { useEffect, useState } from "react";
import { api, artifactUrl } from "../api";
import type { Analysis, Job, Language } from "../types";
import { isPrediction } from "../operations/types";
import { CandidatePanel } from "../studio/CandidatePanel";
import { StructureViewer } from "../viewer/StructureViewer";
import { OperationResults } from "../operations/OperationResults";

export function ExampleJobResult({
  job,
  language,
}: {
  job: Job;
  language: Language;
}) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const prediction = isPrediction(job.request);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setAnalysis(null);
    setSelected(null);
    if (prediction) {
      void api
        .analysis(job.id, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) {
            setAnalysis(value);
            setSelected(value.candidates[0]?.id ?? null);
          }
        })
        .catch((failure) => {
          if (!controller.signal.aborted) setError(String(failure));
        });
    }
    return () => controller.abort();
  }, [job.id, prediction]);
  const candidate = analysis?.candidates.find((value) => value.id === selected);
  return (
    <section
      aria-label={
        language === "zh" ? "模板的真实结果" : "Actual template result"
      }
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {prediction ? (
        <div className="template-result-grid">
          <CandidatePanel
            job={job}
            analysis={analysis}
            language={language}
            loading={!analysis && !error}
            error={error}
            selected={selected}
            onSelect={setSelected}
          />
          <StructureViewer
            urls={candidate ? [artifactUrl(job.id, candidate.artifact)] : []}
            language={language}
          />
        </div>
      ) : (
        <OperationResults job={job} language={language} />
      )}
    </section>
  );
}
