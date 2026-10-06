import { artifactUrl } from "../api";
import type { Language } from "../types";
import type { DatasetArtifact } from "./types";

const retainedData = new Set([
  "compound_library",
  "embedding_row_identities",
  "molecule_embeddings",
  "decoded_umi_evidence",
  "compound_count_matrix",
  "del_comparison_evidence",
  "del_series_counts",
  "del_enrichment_research_model",
  "reported_followup_measurements",
]);

export function ResearchDownloads({
  jobId,
  artifacts,
  language,
}: {
  jobId: string;
  artifacts: DatasetArtifact[];
  language: Language;
}) {
  const zh = language === "zh",
    primary = artifacts.filter((file) =>
      ["csv", "sdf", "pdb", "cif"].includes(file.format),
    ),
    data = artifacts.filter(
      (file) =>
        retainedData.has(file.role) &&
        ["sqlite", "hdf5", "model"].includes(file.format),
    );
  function fileLabel(file: DatasetArtifact) {
    if (["sdf", "pdb", "cif"].includes(file.format))
      return zh ? "分子与复合物" : "Molecules and complexes";
    if (file.format === "hdf5")
      return zh ? "分子检索向量" : "Molecular retrieval vectors";
    if (file.format === "model")
      return zh ? "已训练研究模型" : "Trained research model";
    if (file.format === "sqlite") return zh ? "研究数据" : "Research data";
    return zh ? "研究表格" : "Research table";
  }
  function links(files: DatasetArtifact[]) {
    return files.map((file) => (
      <a key={file.name} href={artifactUrl(jobId, file.name)}>
        {fileLabel(file)} · {file.name}
      </a>
    ));
  }
  if (!primary.length && !data.length) return null;
  return (
    <details className="dataset-download-menu">
      <summary>{zh ? "下载研究结果" : "Download results"}</summary>
      <div>
        {links(primary)}
        {data.length > 0 && (
          <details className="dataset-data-downloads">
            <summary>
              {zh
                ? "研究数据与模型 · 备份或迁移"
                : "Research data and models · backup or transfer"}
            </summary>
            <div>{links(data)}</div>
          </details>
        )}
      </div>
    </details>
  );
}
