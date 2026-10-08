import { useState } from "react";
import { artifactUrl } from "../api";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { StructureViewer } from "../viewer/StructureViewer";
import { Hint } from "../guided/Hint";
import type { Job, Language } from "../types";
import type { DatasetResult } from "./types";
import { CandidateHandoff } from "./CandidateHandoff";
import { supplierLabel } from "./supplier-label";
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
  const zh = language === "zh",
    initial = Math.max(
      0,
      result.candidates.findIndex((row) => Boolean(row.artifact)),
    ),
    [selected, setSelected] = useState(initial),
    [page, setPage] = useState(Math.floor(initial / 15)),
    candidate = result.candidates[selected];
  const hasReceptor = result.artifacts.some(
      (file) => file.name === "receptor.pdb",
    ),
    hasScore = ["gnina", "drugclip", "deli"].includes(result.program),
    molecular = candidate?.artifact
      ? artifactUrl(job.id, candidate.artifact)
      : null;
  const urls = molecular
    ? [
        ...(hasReceptor && candidate.geometry === "binding_pose"
          ? [artifactUrl(job.id, "receptor.pdb")]
          : []),
        molecular,
      ]
    : [];
  const records =
    hasReceptor && candidate?.geometry === "binding_pose"
      ? [0, candidate.record]
      : candidate
        ? [candidate.record]
        : [];
  return (
    <CandidateHandoff
      key={candidate?.id}
      job={job}
      candidate={candidate}
      language={language}
      onCreated={onCreated}
    >
      <div className="dataset-candidate-layout">
        <section className="dataset-candidate-table">
          <div className="dataset-panel-title">
            <strong>{zh ? "候选分子" : "Candidates"}</strong>
            <span>{result.candidates.length.toLocaleString()}</span>
          </div>
          <div className="dataset-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{zh ? "结构" : "Structure"}</th>
                  <th>{zh ? "成员" : "Member"}</th>
                  {hasScore && (
                    <th>
                      {result.program === "gnina"
                        ? zh
                          ? "对接能量"
                          : "Docking energy"
                        : result.program === "drugclip"
                          ? zh
                            ? "检索分数"
                            : "Retrieval score"
                          : result.metadata.model_action === "predict"
                            ? zh
                              ? "预测 log(1＋富集)"
                              : "Predicted log(1+enrichment)"
                            : zh
                              ? "原 DEL 成员富集"
                              : "Original DEL enrichment"}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {result.candidates
                  .slice(page * 15, (page + 1) * 15)
                  .map((row, index) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelected(page * 15 + index)}
                      className={
                        selected === page * 15 + index ? "selected" : ""
                      }
                    >
                      <td>
                        {row.smiles ? (
                          <MoleculeImage
                            source={{ smiles: row.smiles }}
                            language={language}
                            label={row.display_name || row.id}
                            compact
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="dataset-row-title"
                          onClick={() => setSelected(page * 15 + index)}
                        >
                          {row.display_name || row.id}
                        </button>
                        <small>{supplierLabel(row.supplier, zh)}</small>
                      </td>
                      {hasScore && (
                        <td>
                          {(result.program === "gnina"
                            ? row.docking_score
                            : row.score
                          )?.toFixed(3) ?? "—"}
                          {result.program === "gnina" && (
                            <small>kcal/mol</small>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="dataset-table-footer">
            <button
              type="button"
              disabled={!page}
              onClick={() => setPage(page - 1)}
            >
              {zh ? "上一页" : "Previous"}
            </button>
            <span>{page + 1}</span>
            <button
              type="button"
              disabled={(page + 1) * 15 >= result.candidates.length}
              onClick={() => setPage(page + 1)}
            >
              {zh ? "下一页" : "Next"}
            </button>
          </div>
        </section>
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
          {urls.length > 0 ? (
            <StructureViewer
              key={candidate.id}
              urls={urls}
              records={records}
              focusModel={
                hasReceptor && candidate.geometry === "binding_pose" ? 1 : 0
              }
              language={language}
              molecularSource={{ url: molecular!, record: candidate.record }}
              nativeScore={
                candidate.docking_score != null
                  ? {
                      method: "GNINA",
                      scope: "whole_pose",
                      unit: "kcal/mol",
                      value: candidate.docking_score,
                    }
                  : null
              }
            />
          ) : candidate?.smiles ? (
            <div className="dataset-large-depiction">
              <MoleculeImage
                source={{ smiles: candidate.smiles }}
                language={language}
                label={candidate.id}
              />
            </div>
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
      </div>
    </CandidateHandoff>
  );
}
