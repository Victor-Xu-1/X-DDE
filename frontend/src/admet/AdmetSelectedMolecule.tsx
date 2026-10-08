import { artifactUrl } from "../api";
import type { Language, Job } from "../types";
import type { MoleculeRef } from "../research/types";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { StructureViewer } from "../viewer/StructureViewer";
import { EndpointTable } from "./EndpointTable";
import { failureReason } from "./labels";
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
  const url = row.preview ? artifactUrl(job.id, row.preview) : null;
  const source = row.smiles
    ? { smiles: row.smiles }
    : url
      ? { url, record: 0 }
      : null;
  const predictions = {
    id: "predictions",
    label: zh ? "预测性质" : "Predictions",
    content: (
      <>
        <div className="admet-molecule-drawing">
          <MoleculeImage source={source} label={row.name} language={language} />
        </div>
        <EndpointTable language={language} result={result} row={row} />
      </>
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
      />
    ),
  };
  return (
    <section
      className="admet-selected-molecule"
      aria-label={zh ? "所选分子" : "Selected molecule"}
    >
      <header className="admet-molecule-header">
        <h3>
          #{row.record + 1} · {row.name}
        </h3>
        <div className="admet-molecule-actions">
          {url && (
            <a className="secondary-button" href={url} download>
              {zh ? "下载原始分子" : "Download original molecule"}
            </a>
          )}
          {row.status === "predicted" && row.reference && onPrepare && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => onPrepare(row.reference!)}
            >
              {zh ? "用于分子准备" : "Prepare this molecule"}
            </button>
          )}
        </div>
      </header>
      {row.status === "predicted" ? (
        <ResearchTabs
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
