import { artifactUrl } from "../api";
import { useSelectedAsset } from "../operations/useSelectedAsset";
import { ResearchTable } from "../presentation/ResearchTable";
import { VerifiedArtifactDownload } from "../presentation/VerifiedArtifactDownload";
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
              <VerifiedArtifactDownload
                key={original}
                url={artifactUrl(jobId, original)}
                sha256={result.artifact_sha256[original]}
                filename={original}
                language={language}
                label={(i ? moving : reference).asset?.name ?? original}
                downloadLabel={
                  zh ? "下载来源结构" : "Download source structure"
                }
                className="text-button"
              />
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

export function comparisonResultFiles(
  result: ComparisonResult,
  language: Language,
) {
  const zh = language === "zh";
  return [
    [
      "moving-aligned.cif",
      zh ? "已对齐结构" : "Aligned",
      zh ? "已对齐结构 mmCIF" : "Aligned structure mmCIF",
    ],
    [
      "reference-selected.cif",
      zh ? "参照结构" : "Reference",
      zh ? "参照结构 mmCIF" : "Reference mmCIF",
    ],
    [
      "residue-displacements.csv",
      zh ? "位移 CSV" : "CSV",
      zh ? "完整位移 CSV" : "Full displacement CSV",
    ],
    [
      "native-dockq.json",
      zh ? "界面报告" : "Report",
      zh ? "原生界面报告" : "Native interface report",
    ],
  ]
    .filter(([artifact]) => Object.hasOwn(result.artifact_sha256, artifact))
    .map(([artifact, label, downloadLabel]) => ({
      artifact,
      label,
      downloadLabel,
      sha256: result.artifact_sha256[artifact],
    }));
}
