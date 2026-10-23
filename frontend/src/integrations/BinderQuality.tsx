import { artifactUrl } from "../api";
import { SequenceTrack } from "../presentation/SequenceTrack";
import type { Language } from "../types";
import type { BinderQualityReport } from "./types";

const FILTERS: Record<string, [string, string]> = {
  pass_ALA_fraction_filter: ["丙氨酸比例过高", "Excess alanine"],
  pass_GLY_fraction_filter: ["甘氨酸比例过高", "Excess glycine"],
  pass_GLU_fraction_filter: ["谷氨酸比例过高", "Excess glutamate"],
  pass_LEU_fraction_filter: ["亮氨酸比例过高", "Excess leucine"],
  pass_VAL_fraction_filter: ["缬氨酸比例过高", "Excess valine"],
  pass_filter_rmsd_filter: ["复合物重预测偏移", "Complex refold deviation"],
  pass_filter_rmsd_design_filter: [
    "结合体重预测偏移",
    "Binder refold deviation",
  ],
  "pass_designfolding-filter_rmsd_filter": [
    "单体重预测偏移",
    "Monomer refold deviation",
  ],
  pass_has_x_filter: ["序列含未知残基", "Unknown sequence residues"],
};

export function BinderQuality({
  report,
  jobId,
  selected,
  language,
}: {
  report: BinderQualityReport;
  jobId: string;
  selected: string;
  language: Language;
}) {
  const zh = language === "zh";
  const active = report.designs.find((row) => row.candidate_id === selected);
  return (
    <section aria-label={zh ? "结合蛋白质量" : "Binder quality"}>
      <p role="status" className={report.passed ? "notice" : "warning"}>
        <strong>
          {zh
            ? `${report.passed} / ${report.attempted} 条通过原生筛选`
            : `${report.passed} / ${report.attempted} designs pass native filters`}
        </strong>
        {" · "}
        {zh
          ? `保留 ${report.retained} 条供检查；保留不等于合格。`
          : `${report.retained} retained for inspection; retention does not imply qualification.`}
      </p>
      {active && (
        <>
          <dl className="metrics-grid">
            <div>
              <dt>{zh ? "原生筛选" : "Native filters"}</dt>
              <dd>
                {active.passed
                  ? zh
                    ? "通过"
                    : "Pass"
                  : zh
                    ? "未通过"
                    : "Rejected"}
              </dd>
            </div>
            <div>
              <dt>{zh ? "结合体重预测 RMSD" : "Binder refold RMSD"}</dt>
              <dd>{active.binder_refold_rmsd.toFixed(2)} Å</dd>
            </div>
            <div>
              <dt>{zh ? "单体置信度" : "Binder-only confidence"}</dt>
              <dd>
                {(active.binder_refold_confidence * 100).toFixed(1)} / 100
              </dd>
            </div>
            <div>
              <dt>{zh ? "界面埋藏面积" : "Interface buried area"}</dt>
              <dd>{active.buried_area.toFixed(0)} Å²</dd>
            </div>
          </dl>
          {active.failed_filters.length > 0 && (
            <p>
              {active.failed_filters
                .map((key) => FILTERS[key]?.[zh ? 0 : 1] ?? key)
                .join(" · ")}
            </p>
          )}
          <SequenceTrack
            sequence={active.sequence}
            language={language}
            label={zh ? "设计结合体序列" : "Designed binder sequence"}
          />
        </>
      )}
      <details>
        <summary>
          {zh ? "全部设计与筛选结论" : "All designs and filter decisions"}
        </summary>
        <table className="compact-table">
          <thead>
            <tr>
              <th>{zh ? "设计" : "Design"}</th>
              <th>{zh ? "原生筛选" : "Native filters"}</th>
              <th>ipTM</th>
              <th>{zh ? "未通过项" : "Rejected checks"}</th>
            </tr>
          </thead>
          <tbody>
            {report.designs.map((row) => (
              <tr key={row.native_id}>
                <td>{row.candidate_id ?? row.native_id}</td>
                <td>
                  {row.passed
                    ? zh
                      ? "通过"
                      : "Pass"
                    : zh
                      ? "未通过"
                      : "Rejected"}
                </td>
                <td>{row.interface_confidence.toFixed(3)}</td>
                <td>
                  {row.failed_filters
                    .map((key) => FILTERS[key]?.[zh ? 0 : 1] ?? key)
                    .join(" · ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <a href={artifactUrl(jobId, report.source_artifact)} download>
          {zh ? "下载完整原生指标 CSV" : "Download complete native metrics CSV"}
        </a>
      </details>
    </section>
  );
}
