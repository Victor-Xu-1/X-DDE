import { useEffect, useState } from "react";
import { request } from "../api";
import type { Job, Language } from "../types";
import type { AvailableDataset, DatasetSource } from "./types";

/** Resolve only the recorded parent report. A later same-name analysis is not interchangeable. */
export function DELSeriesContext({
  job,
  language,
}: {
  job: Job;
  language: Language;
}) {
  const zh = language === "zh";
  const source: DatasetSource | undefined =
    job.request.operation === "del_series"
      ? job.request.sources.find((item) => item.role === "analysis")
      : undefined;
  const key = JSON.stringify([job.id, source?.job_id, source?.report_sha256]);
  const [loaded, setLoaded] = useState<{
    key: string;
    value: AvailableDataset;
  } | null>(null);
  const [failure, setFailure] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(null);
    setFailure("");
    if (!source) {
      setFailure(key);
      return;
    }
    void request<AvailableDataset & { operation: string }>(
      `/datasets/${source.job_id}/summary`,
      {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(30000),
        ]),
      },
    )
      .then((value) => {
        if (
          value.job_id !== source.job_id ||
          value.report_sha256 !== source.report_sha256 ||
          value.role !== "analysis" ||
          value.operation !== "del_analyze"
        )
          throw new Error("Source report changed");
        if (!controller.signal.aborted) setLoaded({ key, value });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailure(key);
      });
    return () => controller.abort();
  }, [key, retry]);
  const value = loaded?.key === key ? loaded.value : null;
  const unit = value?.metadata.count_unit;
  return (
    <div className="field-help dataset-series-context">
      <p>
        {zh
          ? "汇总全部观测成员的计数后计算富集；不按单分子命中条件筛选。不同周期的系列相互重叠，不应相加为独立成员总数。"
          : "Enrichment uses aggregated counts from all observed members, without molecule-level hit filtering. Series from different cycles overlap and must not be summed as distinct members."}
      </p>
      {value ? (
        <p>
          {zh ? "计数来源：" : "Count source: "}
          {unit === "reads"
            ? zh
              ? "原始读段，保留 PCR 偏倚。"
              : "raw reads, retaining PCR bias."
            : unit === "reported_counts"
              ? zh
                ? "外部报告值，处理方法未独立核实。"
                : "externally reported values; processing is not independently verified."
              : unit === "corrected_umi" || unit === "unique_umi"
                ? zh
                  ? "来源标注为 UMI 计数；正确性仍取决于原始读段与样本设计。"
                  : "source-labelled UMI counts; validity still depends on original reads and sample design."
                : zh
                  ? "历史来源未记录计数类型。"
                  : "the historical source did not record its count unit."}{" "}
          {zh
            ? "富集和区间不代表亲和力、协同性或生物学重复性。"
            : "Enrichment and intervals do not establish affinity, cooperativity or biological reproducibility."}
        </p>
      ) : failure === key ? (
        <p role="alert">
          {zh
            ? "来源说明暂不可核对；原始结果保留。"
            : "Source context could not be verified; original results are retained."}{" "}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            {zh ? "重试" : "Retry"}
          </button>
        </p>
      ) : (
        <p role="status">
          {zh ? "正在核对计数来源…" : "Checking count source…"}
        </p>
      )}
    </div>
  );
}
