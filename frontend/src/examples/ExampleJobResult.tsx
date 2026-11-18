import { useEffect, useState } from "react";
import { api, artifactUrl } from "../api";
import type { Analysis, Job, Language } from "../types";
import { isPrediction } from "../operations/types";
import { CandidatePanel } from "../studio/CandidatePanel";
import { PredictionInspection } from "../studio/PredictionInspection";
import { OperationResults } from "../operations/OperationResults";
import { TemplatePreviewContext } from "./context";
import { predictionMethodLabel } from "../presentation/PredictionResultHeader";

export function ExampleJobResult({
  job,
  language,
  initialCandidateId,
  showSource = true,
}: {
  job: Job;
  language: Language;
  initialCandidateId?: string;
  showSource?: boolean;
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
            setSelected(
              value.candidates.find((row) => row.id === initialCandidateId)
                ?.id ??
                value.candidates[0]?.id ??
                null,
            );
          }
        })
        .catch((failure) => {
          if (!controller.signal.aborted) setError(String(failure));
        });
    }
    return () => controller.abort();
  }, [job.id, prediction, initialCandidateId]);
  const candidate = analysis?.candidates.find((value) => value.id === selected);
  return (
    <TemplatePreviewContext.Provider value={true}>
      <section
        aria-label={
          language === "zh" ? "模板的真实结果" : "Actual template result"
        }
      >
        {showSource && job.request.name && (
          <p
            className={prediction ? "prediction-example-source" : "field-help"}
          >
            <span title={job.request.name}>
              {language === "zh" ? "结果对应任务：" : "Source task: "}
              {job.request.name}
            </span>
            {prediction && predictionMethodLabel(job.request) && (
              <span>
                {language === "zh" ? "模型：" : "Model: "}
                {predictionMethodLabel(job.request)}
              </span>
            )}
          </p>
        )}
        {prediction ? (
          <div className="prediction-result">
            {candidate && (
              <PredictionInspection
                job={job}
                analysis={analysis}
                candidate={candidate}
                urls={[artifactUrl(job.id, candidate.artifact)]}
                language={language}
                onCandidate={setSelected}
              />
            )}
            <section className="prediction-conformer-table">
              <CandidatePanel
                job={job}
                analysis={analysis}
                language={language}
                loading={!analysis && !error}
                error={error}
                selected={selected}
                onSelect={setSelected}
              />
            </section>
          </div>
        ) : (
          <OperationResults
            job={job}
            language={language}
            initialCandidateId={initialCandidateId}
          />
        )}
      </section>
    </TemplatePreviewContext.Provider>
  );
}
