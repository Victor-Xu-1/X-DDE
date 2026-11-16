import { artifactUrl } from "../api";
import type { Language, Job } from "../types";
import type { MoleculeRef } from "../research/types";
import { ResearchTabs } from "../presentation/ResearchTabs";
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
  onPrepare?(reference: MoleculeRef): void;
}) {
  const zh = language === "zh";
  const poseSession = usePoseSession();
  const url = row.preview ? artifactUrl(job.id, row.preview) : null;
  const source = row.smiles
    ? { smiles: row.smiles }
    : url
      ? { url, record: 0 }
      : null;
  const predictions = {
    id: "predictions",
    label: zh ? "二维结构" : "2D structure",
    content: (
      <div className="admet-molecule-drawing">
        <MoleculeImage source={source} label={row.name} language={language} />
      </div>
    ),
  };
  const structure = {
    id: "structure",
    label: zh ? "三维结构" : "3D structure",
    content: (
      <StructureViewer
        urls={url ? [url] : []}
        language={language}
        comparison={false}
        molecularSource={url ? { url, record: 0 } : undefined}
        expectedStructureSha256={
          row.preview ? result.previews_sha256[row.preview] : undefined
        }
      />
    ),
  };
  return (
    <section
      className="admet-selected-molecule"
      aria-label={zh ? "所选分子" : "Selected molecule"}
    >
      <header className="admet-molecule-header">
        <div className="admet-molecule-title">
          <h3>
            #{row.record + 1} · {row.name}
          </h3>
          <p role="status">
            <strong>ADMET-AI</strong> {result.versions["admet-ai"]}
            {" · "}
            {zh ? "已预测" : "Predicted"} {result.predicted_count} /{" "}
            {result.rows.length}
          </p>
        </div>
        <div className="admet-molecule-actions">
          <a
            className="secondary-button"
            href={artifactUrl(job.id, "predictions.csv")}
            download
            aria-label={zh ? "下载预测表" : "Download prediction table"}
            title={zh ? "下载预测表" : "Download prediction table"}
          >
            CSV ↓
          </a>
          {url && (
            <a
              className="secondary-button"
              href={url}
              download
              aria-label={zh ? "下载原始分子" : "Download original molecule"}
              title={zh ? "下载原始分子" : "Download original molecule"}
            >
              SDF ↓
            </a>
          )}
          {row.status === "predicted" && row.reference && onPrepare && (
            <PoseStudyInput original={row.reference} language={language}>
              {(selection) => (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!selection?.ready}
                  onClick={() => {
                    if (selection?.ready) onPrepare(selection.reference);
                  }}
                >
                  {zh ? "用于分子准备" : "Prepare this molecule"}
                </button>
              )}
            </PoseStudyInput>
          )}
        </div>
      </header>
      {row.status === "predicted" ? (
        <ResearchTabs
          active={poseSession?.view}
          onChange={poseSession?.chooseView}
          label={zh ? "分子详情" : "Molecule details"}
          tabs={url ? [predictions, structure] : [predictions]}
        />
      ) : (
        <div className="admet-empty">
          <h4>{zh ? "此记录未得到预测" : "No predictions for this record"}</h4>
          <p>{failureReason(row.reason, zh)}</p>
          <p>
            {zh
              ? "保留原记录编号，便于修正输入后重新预测。"
              : "The original record number is retained so you can correct the input and predict again."}
          </p>
        </div>
      )}
    </section>
  );
}
