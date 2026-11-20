import { useState } from "react";
import type { Language } from "../types";
import { ResearchTable } from "../presentation/ResearchTable";
import { MoleculeImage } from "../presentation/MoleculeImage";
import type { TargetResearchResult } from "./types";
import type { ReferenceSelection } from "./ReferenceImportForm";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import {
  ActivityMoleculePreview,
  ActivityValidityNote,
} from "./ActivityMoleculePreview";
export function ActivityResults({
  result,
  language,
  onImport,
}: {
  result: TargetResearchResult;
  language: Language;
  onImport?(value: ReferenceSelection): void;
}) {
  const zh = language === "zh",
    [message, setMessage] = useState(""),
    [selectedId, setSelectedId] = useState<number | null>(null);
  const value = result.activities;
  if (!value)
    return (
      <p className="result-empty">
        {zh
          ? "这次查询没有返回实测活性记录。"
          : "No reported activity records returned."}
      </p>
    );
  const selected =
    value.rows.find((row) => row.activity_id === selectedId) ?? value.rows[0];
  return (
    <section className="target-activity-workspace">
      <StructureWorkbench
        preview={
          selected ? (
            <ActivityMoleculePreview activity={selected} language={language} />
          ) : null
        }
      >
        <details className="activity-measurement-scope">
          <summary>{zh ? "活性记录口径" : "Activity measurement scope"}</summary>
          <p className="field-help">
            {zh
              ? "保留来源样本的端点、关系符、单位和实验。分别解读 IC50、Ki、Kd 与 EC50。"
              : "Endpoints, relation signs, units and assays come from a bounded source sample. Interpret IC50, Ki, Kd and EC50 separately."}
          </p>
        </details>
        <ResearchTable
          compactToolbar
          rows={value.rows}
          rowId={(row) => String(row.activity_id)}
          language={language}
          compare={false}
          initialVisibleColumns={["molecule", "measurement"]}
          selected={selected ? String(selected.activity_id) : null}
          onSelect={(row) => setSelectedId(row.activity_id)}
          title={zh ? "已有实测活性" : "Reported activities"}
          columns={[
            {
              key: "molecule",
              label: zh ? "化合物" : "Compound",
              value: (row) => row.molecule_chembl_id,
              render: (row) => (
                <div className="molecule-record">
                  <MoleculeImage
                    compact
                    source={
                      row.canonical_smiles
                        ? { smiles: row.canonical_smiles }
                        : null
                    }
                    label={row.molecule_chembl_id}
                    language={language}
                  />
                  <a
                    href={
                      "https://www.ebi.ac.uk/chembl/explore/compound/" +
                      encodeURIComponent(row.molecule_chembl_id)
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {row.molecule_chembl_id}
                  </a>
                </div>
              ),
            },
            {
              key: "endpoint",
              label: zh ? "实测端点" : "Measured endpoint",
              value: (row) => row.standard_type,
            },
            {
              key: "measurement",
              label: zh ? "结果与单位" : "Result and unit",
              value: (row) =>
                (row.standard_relation ?? "") +
                " " +
                (row.standard_value ?? "—") +
                " " +
                (row.standard_units ?? ""),
              render: (row) => (
                <span>
                  <strong>{row.standard_type}</strong>
                  <br />
                  {row.standard_relation ?? ""} {row.standard_value ?? "—"}{" "}
                  {row.standard_units ?? ""}
                  <ActivityValidityNote
                    comment={row.data_validity_comment}
                    language={language}
                  />
                </span>
              ),
            },
            {
              key: "assay",
              label: zh ? "实验" : "Assay",
              value: (row) => row.assay_chembl_id,
              render: (row) => (
                <span title={row.assay_description}>{row.assay_chembl_id}</span>
              ),
            },
            {
              key: "next",
              label: zh ? "下一步" : "Next step",
              sortable: false,
              value: (row) => row.molecule_chembl_id,
              render: (row) => (
                <div className="evidence-row-actions">
                  {onImport && result.analysis_reference && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        onImport({
                          source: "chembl",
                          identifier: row.molecule_chembl_id,
                          evidence: result.analysis_reference,
                          activity_id: row.activity_id,
                        })
                      }
                    >
                      {zh ? "导入化合物" : "Import compound"}
                    </button>
                  )}
                  {row.canonical_smiles && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(row.canonical_smiles!)
                          .then(() =>
                            setMessage(
                              zh
                                ? "分子结构已复制。"
                                : "Molecular structure copied.",
                            ),
                          )
                          .catch(() =>
                            setMessage(
                              zh
                                ? "复制失败，请从原始结果读取结构。"
                                : "Copy failed; use the original result.",
                            ),
                          )
                      }
                    >
                      {zh ? "复制分子结构" : "Copy SMILES"}
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
        {message && <p role="status">{message}</p>}
      </StructureWorkbench>
    </section>
  );
}
