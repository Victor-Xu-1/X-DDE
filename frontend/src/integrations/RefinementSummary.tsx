import { DownloadOutlined } from "@ant-design/icons";
import { csvCell } from "../presentation/table-model";
import { downloadBlob } from "../presentation/visual-export";
import type { Language } from "../types";
import { refinementMetricLabel } from "./refinement-energy-labels";
import type { NativeCandidate } from "./types";
import "./refinement-summary.css";

export function RefinementSummary({
  candidate,
  structureUrl,
  language,
}: {
  candidate: NativeCandidate;
  structureUrl: string;
  language: Language;
}) {
  const zh = language === "zh";
  const title = zh ? "结构精修结果" : "Refinement result";
  const precision = new Intl.NumberFormat(zh ? "zh-CN" : "en", {
    maximumSignificantDigits: 8,
  });
  function exportMetrics() {
    const columns = [
      zh ? "候选" : "Candidate",
      ...candidate.metrics.map(({ name, unit }) =>
        unit ? `${name} (${unit})` : name,
      ),
    ];
    const values = [candidate.id, ...candidate.metrics.map(({ value }) => value)];
    const csv = [columns, values]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    downloadBlob(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
      "scientific-candidates.csv",
    );
  }
  return (
    <section className="refinement-summary" aria-label={title}>
      <h3>{title}</h3>
      <table aria-label={zh ? "原始指标" : "Native metrics"}>
        <tbody>
          {candidate.metrics.map((metric, index) => (
            <tr key={index}>
              <th scope="row">{refinementMetricLabel(metric.name, language)}</th>
              <td title={[metric.method, metric.unit].filter(Boolean).join(" · ")}>
                <span>
                  {Number.isFinite(metric.value) ? precision.format(metric.value) : "—"}
                </span>
                {metric.unit && <small> {metric.unit}</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="refinement-summary-actions">
        <a
          className="secondary-button"
          href={structureUrl}
          aria-label={zh ? "下载优化后结构" : "Download refined structure"}
          download
        >
          <DownloadOutlined aria-hidden="true" /> {zh ? "下载结构" : "Structure"}
        </a>
        <button
          className="secondary-button"
          type="button"
          aria-label={zh ? "导出指标 CSV" : "Export metrics CSV"}
          onClick={exportMetrics}
        >
          {zh ? "指标 CSV" : "Metrics CSV"}
        </button>
      </div>
    </section>
  );
}
