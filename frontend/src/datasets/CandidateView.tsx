import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { useContext, useState } from "react";
import { TemplatePreviewContext } from "../examples/context";
import { artifactUrl } from "../api";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { Hint } from "../guided/Hint";
import type { Job, Language } from "../types";
import type { DatasetResult } from "./types";
import { CandidateHandoff } from "./CandidateHandoff";
import { CandidateTable } from "./CandidateTable";
import { PoseSession } from "../viewer/PoseSession";
export function CandidateView({
  job,
  result,
  language,
  onCreated,
}: {
  job: Job;
  result: DatasetResult;
  language: Language;
  onCreated?(job: Job): void;
}) {
  const sourceSnapshot = useContext(TemplatePreviewContext);
  const zh = language === "zh",
    initial = Math.max(
      0,
      result.candidates.findIndex((row) => Boolean(row.artifact)),
    ),
    [selected, setSelected] = useState(initial),
    candidate = result.candidates[selected];
  const hasReceptor = result.artifacts.some(
      (file) => file.name === "receptor.pdb",
    ),
    molecular = candidate?.artifact
      ? artifactUrl(job.id, candidate.artifact)
      : null;
  const has3d = Boolean(molecular && candidate?.geometry !== "none");
  const urls =
    molecular && has3d
      ? [
          ...(hasReceptor && candidate.geometry === "binding_pose"
            ? [artifactUrl(job.id, "receptor.pdb")]
            : []),
          molecular,
        ]
      : [];
  const records =
    has3d && hasReceptor && candidate?.geometry === "binding_pose"
      ? [0, candidate.record]
      : has3d && candidate
        ? [candidate.record]
        : [];
  const nativeScore =
    candidate?.docking_score != null
      ? {
          method: "GNINA" as const,
          scope: "whole_pose" as const,
          unit: "kcal/mol" as const,
          value: candidate.docking_score,
        }
      : null;
  const frame = {
    sourceSnapshot,
    urls,
    records,
    molecularSource: molecular
      ? { url: molecular, record: candidate.record }
      : undefined,
    nativeScore,
  };
  const source = molecular
    ? { url: molecular, record: candidate.record }
    : candidate?.smiles
      ? { smiles: candidate.smiles }
      : null;
  const content = (
    <StructureWorkbench
      preview={
        <section className="dataset-preview-pane">
          <div className="dataset-panel-title">
            <strong>{candidate?.display_name || candidate?.id}</strong>
            <span>
              {candidate?.geometry === "binding_pose"
                ? zh
                  ? "结合姿势"
                  : "Binding pose"
                : candidate?.geometry === "unbound_conformer"
                  ? zh
                    ? "游离构象"
                    : "Unbound conformer"
                  : zh
                    ? "二维结构"
                    : "2D structure"}
            </span>
          </div>
          {source ? (
            <MolecularPreview
              key={candidate.id}
              urls={urls}
              records={records}
              nativeScore={nativeScore}
              source={source}
              label={candidate.display_name || candidate.id}
              defaultView={has3d ? "3d" : "2d"}
              focusModel={
                hasReceptor && candidate.geometry === "binding_pose" ? 1 : 0
              }
              language={language}
            />
          ) : (
            <div className="dataset-empty">
              {zh
                ? "此成员尚未提供或解析化学结构"
                : "This member's chemical structure has not been supplied or resolved"}
            </div>
          )}
          <div className="dataset-preview-footer">
            {molecular && (
              <a
                className="secondary-button"
                href={`/api/datasets/${job.id}/candidate-structure?compound=${encodeURIComponent(candidate.id)}`}
              >
                {zh ? "下载当前结构" : "Download selected structure"}
              </a>
            )}
            <Hint label={zh ? "预览说明" : "Preview help"}>
              {zh
                ? "检索仅产生候选及游离构象。只有实际对接输出才显示受体中的姿势和几何接触。"
                : "Retrieval produces candidates and unbound conformers. Receptor-frame poses and geometric contacts appear only for actual docking outputs."}
            </Hint>
          </div>
        </section>
      }
    >
      <CandidateTable
        result={result}
        language={language}
        selected={candidate?.id}
        onSelect={(row) => setSelected(result.candidates.indexOf(row))}
      />
    </StructureWorkbench>
  );
  return (
    <PoseSession frame={frame}>
      {sourceSnapshot ? (
        content
      ) : (
        <CandidateHandoff
          key={candidate?.id}
          job={job}
          candidate={candidate}
          language={language}
          onCreated={onCreated}
          receptorArtifact={hasReceptor ? "receptor.pdb" : undefined}
        >
          {content}
        </CandidateHandoff>
      )}
    </PoseSession>
  );
}
