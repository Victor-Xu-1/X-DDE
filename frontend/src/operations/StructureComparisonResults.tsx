import { DownloadOutlined } from "@ant-design/icons";
import type { Job, Language } from "../types";
import { harnessSource } from "../presentation/task-sources";
import { StructureViewer } from "../viewer/StructureViewer";
import { downloadBlob } from "../presentation/visual-export";
import { csvCell } from "../presentation/table-model";
import { Hint } from "../guided/Hint";
import "./comparison-results.css";

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
    { label: "RMSD", key: "rmsd", unit: "Å", value: value.rmsd },
    {
      label: zh ? "匹配靶标原子" : "Matched target atoms",
      key: "matched_target_atoms",
      unit: "",
      value: value.matched_target_atoms,
    },
    {
      label: zh ? "匹配结合体原子" : "Matched binder atoms",
      key: "matched_binder_atoms",
      unit: "",
      value: value.matched_binder_atoms,
    },
  ];
  const numeric = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);
  function exportMetrics() {
    const rows = metrics.map((item) =>
      [item.key, numeric(item.value) ? item.value : null, item.unit]
        .map(csvCell)
        .join(","),
    );
    downloadBlob(
      new Blob(["\uFEFFmetric,value,unit\r\n", rows.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
      "structure-comparison.csv",
    );
  }
  return (
    <section
      className="structure-comparison-results"
      aria-label={zh ? "结构比较结果" : "Structure comparison results"}
    >
      <header className="comparison-summary-actions">
        <Hint
          label={zh ? "RMSD 与匹配原子说明" : "RMSD and atom matching help"}
        >
          {zh
            ? "RMSD 是匹配原子在本次比较中的结构差异，单位为 Å；需结合匹配范围判断，不代表亲和力。缺失指标显示为 —。"
            : "RMSD is the structural difference over this run's matched atoms in Å. Interpret it with the matched scope, not as affinity. Missing values remain absent."}
        </Hint>
        <button
          className="secondary-button"
          type="button"
          onClick={exportMetrics}
          disabled={!metrics.some((metric) => numeric(metric.value))}
        >
          <DownloadOutlined aria-hidden="true" />
          {zh ? "下载指标" : "Download metrics"}
        </button>
      </header>
      <dl className="comparison-metrics">
        {metrics.map((item) => (
          <div key={item.key}>
            <dt>{item.label}</dt>
            <dd title={numeric(item.value) ? String(item.value) : undefined}>
              {numeric(item.value) ? Number(item.value.toPrecision(6)) : "—"}
              {numeric(item.value) && item.unit && <small> {item.unit}</small>}
            </dd>
          </div>
        ))}
      </dl>
      {sources.length > 0 && (
        <>
          <p className="field-help comparison-scope">
            {zh
              ? "下方为原始输入；本次结果未提供可核验的叠合结构。"
              : "Original inputs are shown below; this result did not provide verified aligned structures."}
          </p>
          <div className="paired-structure-views">
            {sources.map((source) => (
              <section key={source.field} className="result-inspector">
                <h3>{source.label}</h3>
                <StructureViewer
                  language={language}
                  urls={["/api/assets/" + source.reference.asset_id]}
                  initialMode="cartoon"
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
