import { Hint } from "../guided/Hint";
import { MoleculeImage } from "../presentation/MoleculeImage";
import {
  ResearchTable,
  type ResearchColumn,
} from "../presentation/ResearchTable";
import type { Language } from "../types";
import { supplierLabel } from "./supplier-label";
import type { DatasetCandidate, DatasetResult } from "./types";
import "./candidate-table.css";

export function CandidateTable({
  result,
  language,
  selected,
  onSelect,
}: {
  result: DatasetResult;
  language: Language;
  selected: string | undefined;
  onSelect(row: DatasetCandidate): void;
}) {
  const zh = language === "zh";
  const docking = result.program === "gnina";
  const hasCNN =
    docking && result.candidates.some((row) => row.cnn_score != null);
  const hasAffinity =
    docking && result.candidates.some((row) => row.cnn_affinity != null);
  const columns: ResearchColumn<DatasetCandidate>[] = [
    {
      key: "member",
      label: zh ? "成员" : "Member",
      value: (row) => row.display_name || row.id,
      render: (row) => (
        <>
          <button
            type="button"
            className="dataset-row-title"
            onClick={() => onSelect(row)}
          >
            {row.display_name || row.id}
          </button>
          <small>{supplierLabel(row.supplier, zh)}</small>
        </>
      ),
    },
    {
      key: "structure",
      label: zh ? "结构" : "Structure",
      exportLabel: "SMILES",
      value: (row) => row.smiles || null,
      sortable: false,
      render: (row) =>
        row.smiles ? (
          <MoleculeImage
            source={{ smiles: row.smiles }}
            language={language}
            label={row.display_name || row.id}
            compact
          />
        ) : (
          "—"
        ),
    },
  ];
  if (["gnina", "drugclip", "deli"].includes(result.program)) {
    columns.push({
      key: "score",
      label: docking
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
              : "Original DEL enrichment",
      exportLabel: docking ? "GNINA_kcal_per_mol" : undefined,
      numeric: true,
      value: (row) => (docking ? row.docking_score : row.score) ?? null,
      render: (row) => (
        <>
          {(docking ? row.docking_score : row.score)?.toFixed(3) ?? "—"}
          {docking && <small>kcal/mol</small>}
        </>
      ),
    });
  }
  if (hasCNN)
    columns.push({
      key: "cnn",
      label: zh ? "CNN 评分" : "CNN score",
      exportLabel: "CNNscore",
      numeric: true,
      value: (row) => row.cnn_score ?? null,
      render: (row) => row.cnn_score?.toFixed(3) ?? "—",
    });
  if (hasAffinity)
    columns.push({
      key: "affinity",
      label: zh ? "CNN 亲和力模型输出" : "CNN affinity model output",
      exportLabel: "CNNaffinity_model_output",
      numeric: true,
      value: (row) => row.cnn_affinity ?? null,
      render: (row) => row.cnn_affinity?.toFixed(3) ?? "—",
    });
  if (docking && result.candidates.some((row) => row.score != null))
    columns.push({
      key: "upstream",
      label: zh ? "上游筛选分数" : "Upstream screening score",
      numeric: true,
      value: (row) => row.score ?? null,
      render: (row) => row.score?.toFixed(3) ?? "—",
    });
  return (
    <section className="dataset-candidate-table">
      <div className="dataset-panel-title">
        <strong>{zh ? "候选分子" : "Candidates"}</strong>
        {docking && (
          <Hint
            label={
              zh
                ? "如何比较对接评分？"
                : "How should docking scores be compared?"
            }
          >
            {zh
              ? "保留原始候选顺序。CNN 方案按每个分子的 CNN 评分选择姿势；同时比较对接能量。亲和力模型输出不代表实测亲和力，几何接触不代表单个残基的作用能。列设置可显示更多原始指标，导出包含全部指标和完整精度。"
              : "Native candidate order is retained. CNN protocols select poses within each molecule by CNN score; compare docking energy alongside it. Affinity model outputs are not measured affinity, and geometric contacts are not per-residue interaction energies. Columns expose more native metrics; exports include every metric at full precision."}
          </Hint>
        )}
      </div>
      <ResearchTable
        rows={result.candidates}
        columns={columns}
        rowId={(row) => row.id}
        title={zh ? "候选分子" : "Candidates"}
        language={language}
        selected={selected}
        onSelect={onSelect}
        initialVisibleColumns={columns
          .filter((column) => !["affinity", "upstream"].includes(column.key))
          .map((column) => column.key)}
      />
    </section>
  );
}
