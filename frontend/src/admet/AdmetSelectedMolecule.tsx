import { artifactUrl } from "../api";
import type { Language, Job } from "../types";
import type { MoleculeRef } from "../research/types";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { MoleculeResultToolbar } from "../presentation/MoleculeResultToolbar";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { StructureViewer } from "../viewer/StructureViewer";
import { failureReason } from "./labels";
import { PoseStudyInput } from "../viewer/PoseStudyInput";
import { usePoseSession } from "../viewer/PoseSession";
import type { AdmetResult, AdmetRow } from "./types";

export function AdmetSelectedMolecule({
  job,
  result,
  row,
  language,
  onPrepare,
}: {
  job: Job;
  result: AdmetResult;
  row: AdmetRow;
  language: Language;
  onPrepare?(reference: MoleculeRef, trigger: HTMLButtonElement): void;
}) {
  const zh = language === "zh";
  const poseSession = usePoseSession();
  // Calculated versions have their own verified identity; undo restores the artifact.
  const structureSha256 =
    poseSession?.controller.pose.object?.reference.sha256 ??
    (row.preview ? result.previews_sha256[row.preview] : undefined);
  const url = row.preview ? artifactUrl(job.id, row.preview) : null;
  const source = row.smiles
    ? { smiles: row.smiles }
    : url
      ? { url, record: 0 }
      : null;
  const predictions = {
    id: "predictions",
    label: zh ? "二维结构" : "2D structure",
    shortLabel: "2D",
    content: (
      <div className="admet-molecule-drawing">
        <MoleculeImage source={source} label={row.name} language={language} />
      </div>
    ),
  };
  const structure = {
    id: "structure",
    label: zh ? "三维结构" : "3D structure",
    shortLabel: "3D",
    content: (
      <StructureViewer
        urls={url ? [url] : []}
        language={language}
        comparison={false}
        molecularSource={url ? { url, record: 0 } : undefined}
        expectedStructureSha256={structureSha256}
      />
    ),
  };
  const toolbar = (
    <MoleculeResultToolbar
      name={`#${row.record + 1} · ${row.name}`}
      status={
        <>
          <strong>ADMET-AI</strong> {result.versions["admet-ai"]}
          {" · "}
          <span className="admet-predicted-count">
            {zh ? "已预测" : "Predicted"} {result.predicted_count} /{" "}
            {result.rows.length}
          </span>
        </>
      }
    >
      <details className="admet-molecule-downloads">
        <summary className="secondary-button">
          {zh ? "下载" : "Download"}
        </summary>
        <div>
          <a href={artifactUrl(job.id, "predictions.csv")} download>
            {zh ? "下载预测表" : "Download prediction table"}
          </a>
          {url && (
            <a href={url} download>
              {zh ? "下载原始分子" : "Download original molecule"}
            </a>
          )}
        </div>
      </details>
      {row.status === "predicted" && row.reference && onPrepare && (
        <PoseStudyInput original={row.reference} language={language}>
          {(selection) => (
            <button
              className="secondary-button"
              type="button"
              disabled={!selection?.ready}
              onClick={(event) => {
                if (selection?.ready)
                  onPrepare(selection.reference, event.currentTarget);
              }}
            >
              {zh ? "用于分子准备" : "Prepare this molecule"}
            </button>
          )}
        </PoseStudyInput>
      )}
    </MoleculeResultToolbar>
  );
  return (
    <section
      className="admet-selected-molecule"
      aria-label={zh ? "所选分子" : "Selected molecule"}
    >
      {row.status === "predicted" ? (
        <ResearchTabs
          active={poseSession?.view}
          onChange={poseSession?.chooseView}
          label={zh ? "分子详情" : "Molecule details"}
          tabs={url ? [predictions, structure] : [predictions]}
          toolbar={toolbar}
        />
      ) : (
        <>
          {toolbar}
          <div className="admet-empty">
            <h4>
              {zh ? "此记录未得到预测" : "No predictions for this record"}
            </h4>
            <p>{failureReason(row.reason, zh)}</p>
            <p>
              {zh
                ? "保留原记录编号，便于修正输入后重新预测。"
                : "The original record number is retained so you can correct the input and predict again."}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
