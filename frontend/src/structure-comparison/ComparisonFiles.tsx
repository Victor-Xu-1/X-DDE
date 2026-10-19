import { artifactUrl } from "../api";
import { useSelectedAsset } from "../operations/useSelectedAsset";
import { ResearchTable } from "../presentation/ResearchTable";
import type { Language } from "../types";
import { addressLabel, type ComparisonResult } from "./types";

export function ComparisonSources({
  jobId,
  result,
  language,
}: {
  jobId: string;
  result: ComparisonResult;
  language: Language;
}) {
  const zh = language === "zh";
  const reference = useSelectedAsset(
    result.reference.asset_id,
    "structure",
    [".pdb", ".cif"],
    25 * 1024 ** 2,
    null,
  );
  const moving = useSelectedAsset(
    result.moving.asset_id,
    "structure",
    [".pdb", ".cif"],
    25 * 1024 ** 2,
    null,
  );
  return (
    <>
      {result.inspections.map((inspection, i) => {
        const side = i ? "moving" : "reference";
        const original = Object.keys(result.artifact_sha256).find((name) =>
          name.startsWith(side + "-source."),
        );
        return (
          <section key={side}>
            <h3>
              {i
                ? zh
                  ? "比较结构"
                  : "Comparison structure"
                : zh
                  ? "参照结构"
                  : "Reference structure"}
            </h3>
            {original && (
              <a href={artifactUrl(jobId, original)} download>
                {(i ? moving : reference).asset?.name ?? original}
              </a>
            )}
            <p>
              {inspection.polymer.polymer_residues}{" "}
              {zh
                ? "个观测聚合物残基；模型"
                : "observed polymer residues; model"}{" "}
              {inspection.structure.selected_model_index}
            </p>
            <ResearchTable
              rows={inspection.polymer.modified_residues}
              compare={false}
              language={language}
              title={
                (zh ? "保留的修饰残基" : "Retained modified residues") +
                (i ? " · 2" : " · 1")
              }
              rowId={(row) => addressLabel(row)}
              columns={[
                {
                  key: "residue",
                  label: zh ? "来源残基" : "Source residue",
                  value: (r) => `${addressLabel(r)} ${r.residue}`,
                },
                {
                  key: "parent",
                  label: zh ? "原作者标注的母体" : "Source parent annotation",
                  value: (r) => r.parent,
                },
              ]}
            />
          </section>
        );
      })}
    </>
  );
}

export function ComparisonDownloads({
  jobId,
  language,
}: {
  jobId: string;
  language: Language;
}) {
  const zh = language === "zh";
  const files = [
    ["moving-aligned.cif", zh ? "已对齐结构 mmCIF" : "Aligned structure mmCIF"],
    ["reference-selected.cif", zh ? "参照结构 mmCIF" : "Reference mmCIF"],
    [
      "residue-displacements.csv",
      zh ? "完整位移 CSV" : "Full displacement CSV",
    ],
    ["native-dockq.json", zh ? "原生界面报告" : "Native interface report"],
  ];
  return (
    <div className="comparison-downloads">
      {files.map(([name, label]) => (
        <a
          key={name}
          className="secondary-button"
          href={artifactUrl(jobId, name)}
          download
        >
          {label}
        </a>
      ))}
    </div>
  );
}
