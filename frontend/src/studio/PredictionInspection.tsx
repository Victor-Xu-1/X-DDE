import { useCallback, useState } from "react";
import { ConfidencePanel } from "../operations/ConfidencePanel";
import { PredictionConfidenceCard } from "../presentation/PredictionConfidenceCard";
import { PredictionSamples } from "../presentation/PredictionSamples";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import type { Analysis, Candidate, Job, Language } from "../types";
import type {
  ConfidenceBinding,
  ConfidenceInspection,
} from "../viewer/confidence-types";
import { StructureViewer } from "../viewer/StructureViewer";

export function PredictionInspection(p: {
  job: Job | null;
  analysis: Analysis | null;
  candidate?: Candidate | null;
  urls: string[];
  language: Language;
  comparison?: boolean;
  focusResidue?: { residue: string; nonce: number } | null;
  onCandidate(id: string): void;
}) {
  const [sequenceHost, setSequenceHost] = useState<HTMLDivElement | null>(null);
  const selectedKey = `${p.job?.id}:${p.candidate?.id}`;
  const [annotation, setAnnotation] = useState<{
    key: string;
    value: ConfidenceBinding | null;
  }>();
  const [inspection, setInspection] = useState<{
    key: string;
    value: ConfidenceInspection | null;
  }>();
  const [residueSelection, setResidueSelection] = useState<{
    key: string;
    value: string[];
  }>();
  const [tokenSelection, setTokenSelection] = useState<{
    key: string;
    tokens: number[];
    nonce: number;
  } | null>(null);
  const [actualTokens, setActualTokens] = useState<{
    key: string;
    tokens: number[];
  } | null>(null);
  const receiveBinding = useCallback(
    (value: ConfidenceBinding | null) =>
      setAnnotation({ key: selectedKey, value }),
    [selectedKey],
  );
  const mapped = inspection?.key === selectedKey ? inspection.value : null;
  const zh = p.language === "zh";
  const confidenceAvailable =
    p.job &&
    p.candidate &&
    (!("parameters" in p.job.request) ||
      p.job.request.parameters.atom_confidence !== false);
  const samples = (p.analysis?.candidates ?? []).map((row) => {
    const match = /^(?:seed-(\d+)-)?sample-(\d+)(?:-[0-9a-f]{12})?$/.exec(
      row.id,
    );
    return {
      id: row.id,
      artifact: row.artifact,
      seed: match?.[1] ? Number(match[1]) : null,
      sample: match ? Number(match[2]) : null,
      metrics: [
        { name: "Ranking score", value: row.ranking_score, unit: "" },
        { name: "pTM", value: row.ptm, unit: "0–1" },
        { name: "ipTM", value: row.iptm, unit: "0–1" },
        { name: "pLDDT", value: row.plddt, unit: "0–100" },
      ],
    };
  });
  return (
    <>
      {p.job && p.candidate && (
        <PredictionSamples
          job={p.job.id}
          rows={samples}
          selected={p.candidate.id}
          language={p.language}
          onSelect={p.onCandidate}
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
              comparison={Boolean(p.comparison)}
              confidence={
                p.comparison || annotation?.key !== selectedKey
                  ? null
                  : annotation?.value
              }
              onConfidenceInspection={(value) =>
                setInspection({ key: selectedKey, value })
              }
              confidenceSelection={
                mapped?.key === tokenSelection?.key ? tokenSelection : null
              }
              onConfidenceSelected={setActualTokens}
              onResiduesSelected={(value) =>
                setResidueSelection({ key: selectedKey, value })
              }
            />
          </div>
        }
      >
        {confidenceAvailable && p.job && p.candidate ? (
          <ConfidencePanel
            jobId={p.job.id}
            candidate={p.candidate.id}
            language={p.language}
            onBinding={receiveBinding}
            inspection={p.comparison ? null : mapped}
            selectedResidues={
              residueSelection?.key === selectedKey
                ? residueSelection.value
                : []
            }
            selectedTokens={
              actualTokens?.key === mapped?.key ? actualTokens?.tokens : []
            }
            onTokens={(tokens) => {
              if (mapped)
                setTokenSelection({
                  key: mapped.key,
                  tokens,
                  nonce: Date.now(),
                });
            }}
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
