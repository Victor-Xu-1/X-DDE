import type { Job, Language } from "../types";
import { harnessSource } from "../presentation/task-sources";
import { ResearchTable } from "../presentation/ResearchTable";
import { StructureViewer } from "../viewer/StructureViewer";
export function StructureComparisonResults({
  job,
  value,
  language,
}: {
  job: Job;
  value: Record<string, unknown>;
  language: Language;
}) {
  const zh = language === "zh";
  const sources = [
    {
      field: "reference_path",
      label: zh
        ? "参照结构 · 原始输入"
        : "Reference structure · Original input",
    },
    {
      field: "mobile_path",
      label: zh ? "比较结构 · 原始输入" : "Compared structure · Original input",
    },
  ].flatMap((item) => {
    const reference = harnessSource(job, item.field);
    return reference ? [{ ...item, reference }] : [];
  });
  const metrics = [
    { label: "RMSD", unit: "Å", value: value.rmsd },
    {
      label: zh ? "匹配靶标原子" : "Matched target atoms",
      unit: "",
      value: value.matched_target_atoms,
    },
    {
      label: zh ? "匹配结合体原子" : "Matched binder atoms",
      unit: "",
      value: value.matched_binder_atoms,
    },
  ].filter(
    (item) => typeof item.value === "number" && Number.isFinite(item.value),
  );
  return (
    <section className="structure-comparison-results">
      <ResearchTable
        rows={metrics}
        language={language}
        title={zh ? "结构比较结果" : "Structure comparison results"}
        compare={false}
        rowId={(row) => row.label}
        columns={[
          {
            key: "metric",
            label: zh ? "指标" : "Metric",
            value: (row) => row.label,
          },
          {
            key: "value",
            label: zh ? "原始结果" : "Native value",
            value: (row) => row.value as number,
            numeric: true,
          },
          {
            key: "unit",
            label: zh ? "单位" : "Unit",
            value: (row) => row.unit,
          },
        ]}
      />
      {sources.length > 0 && (
        <>
          <p className="field-help">
            {zh
              ? "下方保留原始输入坐标，用于查看与下载；此历史结果未提供可核验的叠合坐标，预览不会伪装成已经对齐。"
              : "Original input coordinates are shown for inspection and download. This historical result did not provide verified aligned coordinates; these views do not claim alignment."}
          </p>
          <div className="paired-structure-views">
            {sources.map((source) => (
              <section key={source.field} className="result-inspector">
                <h3>{source.label}</h3>
                <StructureViewer
                  language={language}
                  urls={["/api/assets/" + source.reference.asset_id]}
                />
                <a href={"/api/assets/" + source.reference.asset_id} download>
                  {zh ? "下载此结构" : "Download this structure"}
                </a>
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
