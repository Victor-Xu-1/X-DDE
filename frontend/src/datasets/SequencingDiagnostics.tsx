import type { Language } from "../types";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";
import { Bars } from "./CountBars";
import {
  umiStates,
  umiStateLabel,
  type SequencingDocument,
} from "./sequencing-quality";

export function SequencingDiagnostics({
  document,
  language,
}: {
  document: SequencingDocument;
  language: Language;
}) {
  const zh = language === "zh",
    umi = document.umi_integrity;
  const failureNames: Record<string, [string, string]> = {
    FailedBuildingBlockCall: [
      "砌块条码未匹配",
      "Building-block barcode not matched",
    ],
    FailedStaticAlignment: ["条码框架未匹配", "Barcode framework not matched"],
    below_selected_mean_quality: [
      "低于所选质量阈值",
      "Below selected quality threshold",
    ],
    unassigned_sample_barcode: [
      "样本条码未分配",
      "Sample barcode not assigned",
    ],
    invalid_or_ambiguous_umi: [
      "UMI 存在不确定碱基",
      "Invalid or ambiguous UMI",
    ],
  };
  return (
    <>
      <section
        className="dataset-table-region"
        aria-label={zh ? "UMI 完整性" : "UMI completeness"}
      >
        <h3>{zh ? "UMI 完整性" : "UMI completeness"}</h3>
        {umi ? (
          <>
            <p className="field-help">
              {Object.entries(umi.expected_lengths)
                .map(
                  ([id, length]) =>
                    `${id}: ${length === null ? (zh ? "未定义 UMI" : "no UMI defined") : `${length} ${zh ? "碱基" : "bases"}`}`,
                )
                .join(" · ")}
            </p>
            <div className="dataset-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{zh ? "UMI 状态" : "UMI status"}</th>
                    <th>{zh ? "读段" : "Reads"}</th>
                    <th>{zh ? "观测记录" : "Observations"}</th>
                  </tr>
                </thead>
                <tbody>
                  {umiStates
                    .filter(
                      (key) =>
                        key === "complete" || umi.reads_by_status[key] > 0,
                    )
                    .map((key) => (
                      <tr key={key}>
                        <th scope="row">{umiStateLabel(key, zh)}</th>
                        <td>{umi.reads_by_status[key].toLocaleString()}</td>
                        <td>{umi.records_by_status[key].toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="field-help">
              {zh
                ? "库成员识别与 UMI 完整性分别判断。仅长度完整、碱基明确的 UMI 用于去重；观测记录按样本、库和成员分别统计，不等于实测分子数。"
                : "Member identification and UMI completeness are assessed separately. Only complete, unambiguous UMIs enter deduplication. Observations are scoped to sample, library and member, not measured molecule counts."}
            </p>
          </>
        ) : (
          <p className="field-help">
            {zh
              ? "此历史结果未评估 UMI 完整性。可查看原始读段计数；用于 UMI 去重前，请用原始库定义重新解码。"
              : "UMI completeness was not assessed for this historical result. Raw-read counts remain available; decode again with the original library before UMI deduplication."}
          </p>
        )}
      </section>
      {document.failures && Object.keys(document.failures).length > 0 && (
        <Bars
          language={language}
          title={zh ? "未解码原因" : "Reasons reads were not decoded"}
          rows={Object.entries(document.failures).map(([key, value]) => ({
            name: failureNames[key]?.[zh ? 0 : 1] ?? key,
            value,
          }))}
        />
      )}
      {document.lengths && (
        <section>
          <InteractivePlot
            language={language}
            title={zh ? "读段长度分布" : "Read-length distribution"}
            data={[
              {
                type: "bar",
                x: document.lengths.map((row) => row.length),
                y: document.lengths.map((row) => row.reads),
                marker: { color: "#7465e6" },
                hovertemplate: "%{x} bp · %{y:,}<extra></extra>",
              },
            ]}
            layout={{
              showlegend: false,
              xaxis: {
                title: {
                  text: zh ? "读段长度（碱基）" : "Read length (bases)",
                },
              },
              yaxis: {
                title: { text: zh ? "读段数" : "Reads" },
                rangemode: "tozero",
              },
            }}
          />
          {document.q30_fraction !== undefined && (
            <p className="field-help">
              Q30: {(document.q30_fraction * 100).toFixed(2)}%
              {document.bases !== undefined &&
                ` · ${document.bases.toLocaleString()} ${zh ? "碱基" : "bases"}`}
            </p>
          )}
        </section>
      )}
    </>
  );
}
