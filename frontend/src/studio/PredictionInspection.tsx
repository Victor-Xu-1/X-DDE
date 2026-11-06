import { useState } from "react";
import { ConfidencePanel } from "../operations/ConfidencePanel";
import { PredictionConfidenceCard } from "../presentation/PredictionConfidenceCard";
import { PredictionSamples } from "../presentation/PredictionSamples";
import { predictionSampleIdentity } from "../presentation/PredictionSampleIdentity";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import type { Analysis, Candidate, Job, Language } from "../types";
import { usePredictionConfidence } from "../presentation/usePredictionConfidence";
import { StructureViewer } from "../viewer/StructureViewer";

export function PredictionInspection(p: {
  job: Job | null;
  analysis: Analysis | null;
  candidate?: Candidate | null;
  urls: string[];
  language: Language;
  overlayCount?: number;
  focusResidue?: { residue: string; nonce: number } | null;
  onCandidate(id: string): void;
}) {
  const [sequenceHost, setSequenceHost] = useState<HTMLDivElement | null>(null);
  const zh = p.language === "zh";
  const comparison = (p.overlayCount ?? 0) > 1;
  const confidenceAvailable =
    p.job &&
    p.candidate &&
    (!("parameters" in p.job.request) ||
      p.job.request.parameters.atom_confidence !== false);
  const confidence = usePredictionConfidence(
    p.job?.id ?? "",
    p.candidate?.id ?? "",
    Boolean(confidenceAvailable && !comparison),
  );
  const samples = (p.analysis?.candidates ?? []).map((row) => ({
    id: row.id,
    artifact: row.artifact,
    ...predictionSampleIdentity(row.id),
    metrics: [
      { name: "Ranking score", value: row.ranking_score, unit: "" },
      { name: "pTM", value: row.ptm, unit: "0–1" },
      { name: "ipTM", value: row.iptm, unit: "0–1" },
      { name: "pLDDT", value: row.plddt, unit: "0–100" },
    ],
  }));
  return (
    <>
      {p.job && p.candidate && (
        <PredictionSamples
          job={p.job.id}
          rows={samples}
          selected={p.candidate.id}
          language={p.language}
          onSelect={p.onCandidate}
          overlayCount={p.overlayCount}
        />
      )}
      <StructureWorkbench
        sequenceHostRef={setSequenceHost}
        preview={
          <div className="viewer-column">
            <StructureViewer
              urls={p.urls}
              sequenceHost={sequenceHost}
              language={p.language}
              focusResidue={p.focusResidue ?? null}
              comparison={comparison}
              {...confidence.viewer}
            />
          </div>
        }
      >
        {comparison ? (
          <PredictionConfidenceCard title={zh ? "构象叠加" : "Sample overlay"}>
            <p>
              {zh
                ? "选择一个构象即可查看对应的置信度和下载文件。"
                : "Select one sample to inspect its confidence and download its files."}
            </p>
          </PredictionConfidenceCard>
        ) : confidenceAvailable && p.job && p.candidate ? (
          <ConfidencePanel
            jobId={p.job.id}
            candidate={p.candidate.id}
            language={p.language}
            {...confidence.panel}
          />
        ) : (
          <PredictionConfidenceCard
            title={zh ? "预测对齐误差" : "Predicted aligned error"}
          >
            <p>
              {zh
                ? "此构象尚无可显示的逐原子置信度。"
                : "No atom-level confidence is available for this conformer."}
            </p>
          </PredictionConfidenceCard>
        )}
      </StructureWorkbench>
    </>
  );
}
