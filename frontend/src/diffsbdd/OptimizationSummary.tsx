import type { Language } from "../types";
import type { OptimizationReview } from "./optimization-model";
import "./optimization-results.css";

export function OptimizationSummary({
  review,
  language,
  canSelect,
  onSelect,
}: {
  review: OptimizationReview;
  language: Language;
  canSelect: boolean;
  onSelect(record: number): void;
}) {
  const zh = language === "zh";
  if (review.state !== "ready")
    return (
      <p className="field-help" role="status">
        {review.state === "invalid"
          ? zh
            ? "优化摘要与原生候选记录无法核对；结构与原始文件仍可查看。"
            : "The optimization summary does not match its native candidate records; structures and original files remain available."
          : zh
            ? "这份历史结果未记录优化比较数据；请查看候选与原始文件。"
            : "This historical result has no recorded optimization comparison; inspect its candidates and original files."}
      </p>
    );
  const { data } = review;
  const best = data.bestGenerated;
  const objective = data.objective.toUpperCase();
  const entries = [
    [
      zh ? `起始 ${objective}` : `Starting ${objective}`,
      data.initial.toFixed(4),
    ],
    [
      zh
        ? `候选${data.objective === "qed" ? "最高" : "最低"} ${objective}`
        : `Best generated ${objective}`,
      best?.score.toFixed(4) ?? "—",
    ],
    [
      zh ? "描述符改善候选" : "Descriptor-improved candidates",
      `${data.candidates.filter((row) => row.improved).length} / ${data.candidates.length}`,
    ],
    [
      zh ? "已完成轮次" : "Completed rounds",
      `${data.history.length} / ${data.rounds}`,
    ],
  ];
  return (
    <section
      className="optimization-overview"
      aria-label={zh ? "优化结果概览" : "Optimization overview"}
    >
      <dl>
        {entries.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="optimization-overview-actions">
        <p className="field-help">
          {zh
            ? "QED 越高越好，SA 越低越好。结构可能改变；描述符改善不代表活性或亲和力改善。"
            : "Higher QED and lower SA are preferred. Structures may change; descriptor gains do not establish activity or affinity gains."}
        </p>
        {best && (
          <button
            type="button"
            className="secondary-button"
            disabled={!canSelect}
            onClick={() => onSelect(best.record)}
          >
            {zh
              ? `查看领先候选 ${best.record + 1}`
              : `Inspect leading candidate ${best.record + 1}`}
          </button>
        )}
      </div>
    </section>
  );
}
