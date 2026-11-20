import { DownloadOutlined } from "@ant-design/icons";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { useContext, useState, type ReactNode } from "react";
import { TemplatePreviewContext } from "../examples/context";
import { artifactUrl } from "../api";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { Hint } from "../guided/Hint";
import type { Job, Language } from "../types";
import type { DatasetResult } from "./types";
import { CandidateHandoff } from "./CandidateHandoff";
import { CandidateTable } from "./CandidateTable";
import { PoseSession } from "../viewer/PoseSession";
import { DELCandidateEvidence } from "./DELCandidateEvidence";
import "./CandidateView.css";
export function CandidateView({
  job,
  result,
  language,
  onCreated,
  summary,
  screeningReview = false,
}: {
  job: Job;
  result: DatasetResult;
  language: Language;
  onCreated?(job: Job): void;
  summary?: ReactNode;
  screeningReview?: boolean;
}) {
  const sourceSnapshot = useContext(TemplatePreviewContext);
  const delReview = result.operation?.startsWith("del_");
  const inlineToolbar = delReview || screeningReview;
  const zh = language === "zh",
    initial = Math.max(
      0,
      result.candidates.findIndex((row) => Boolean(row.artifact)),
    ),
    [selected, setSelected] = useState(initial),
    [evidenceOpen, setEvidenceOpen] = useState(false),
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
  // These results provide calculated free conformers in their declared SDF.
  const nativeArtifact =
    candidate?.geometry === "unbound_conformer" &&
    (result.operation === "del_candidates" ||
      result.operation === "drugclip_retrieve" ||
      result.operation === "library_subset")
      ? result.artifacts.find(
          (file) =>
            file.name === candidate.artifact &&
            file.format === "sdf" &&
            (result.operation !== "library_subset" ||
              file.role === "unbound_candidates"),
        )
      : undefined;
  const frame = {
    sourceSnapshot,
    nativeArtifactSha256: nativeArtifact?.sha256,
    nativeArtifactRecord: nativeArtifact ? candidate.record : undefined,
    urls,
    records,
    molecularSource: molecular
      ? { url: molecular, record: candidate.record }
      : undefined,
    nativeScore,
  };
  const source = molecular
    ? {
        url: molecular,
        record: candidate.record,
        sha256: nativeArtifact?.sha256,
      }
    : candidate?.smiles
      ? { smiles: candidate.smiles }
      : null;
  const structureDownload = zh
    ? "下载原始结果结构"
    : "Download original result structure";
  const heading = (
    <header className="candidate-preview-heading">
      <div className="candidate-preview-identity">
        <strong>{candidate?.display_name || candidate?.id}</strong>
        {source && (
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
        )}
      </div>
      <div className="candidate-preview-actions">
        {molecular && (
          <a
            className="secondary-button"
            aria-label={structureDownload}
            title={structureDownload}
            href={`/api/datasets/${job.id}/candidate-structure?compound=${encodeURIComponent(candidate.id)}`}
          >
            <DownloadOutlined aria-hidden="true" />
            <span className="candidate-structure-label">
              {inlineToolbar ? (zh ? "结构" : "Structure") : structureDownload}
            </span>
          </a>
        )}
        <Hint label={zh ? "预览说明" : "Preview help"}>
          {zh
            ? "结合姿势来自本次对接的原始结构；游离构象来自源结果的分子文件。"
            : "Binding poses use the original docked coordinates. Free conformers use the retained molecular file."}
        </Hint>
      </div>
    </header>
  );
  const content = (
    <StructureWorkbench
      preview={
        <section
          className="dataset-preview-pane candidate-inspection-preview"
          data-del-review={delReview || undefined}
        >
          {(!inlineToolbar || !source) && heading}
          {source ? (
            <MolecularPreview
              key={candidate.id}
              urls={urls}
              records={records}
              nativeScore={nativeScore}
              nativeArtifactSha256={frame.nativeArtifactSha256}
              nativeArtifactRecord={frame.nativeArtifactRecord}
              source={source}
              toolbar={inlineToolbar ? heading : undefined}
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
        </section>
      }
    >
      {summary && <div className="candidate-inspection-summary">{summary}</div>}
      {result.operation === "del_candidates" && candidate && (
        <details
          className="candidate-evidence-disclosure"
          open={evidenceOpen}
          onToggle={(event) => setEvidenceOpen(event.currentTarget.open)}
        >
          <summary>
            {zh ? "计数与样本支持" : "Counts and sample support"}
          </summary>
          {evidenceOpen && (
            <DELCandidateEvidence
              jobId={job.id}
              candidate={candidate}
              result={result}
              language={language}
            />
          )}
        </details>
      )}
      <CandidateTable
        result={result}
        language={language}
        selected={candidate?.id}
        compactReview={inlineToolbar}
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
