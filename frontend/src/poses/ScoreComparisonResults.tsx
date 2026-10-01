import { scoreLabel } from "../docking/scoreLabels";
import type { Language } from "../types";
import type { PoseSet } from "./types";
import type { ScoreComparison } from "./comparisonTypes";
export function ScoreComparisonResults({
  result,
  value,
  language,
  onSelect,
}: {
  result: ScoreComparison;
  value: PoseSet;
  language: Language;
  onSelect: (stepId: string, record: number) => void;
}) {
  const zh = language === "zh",
    sources = new Map(
      value.outcomes.map((o) => [o.combination.step_id, o.combination]),
    );
  return (
    <section
      className="score-comparison-results"
      aria-label={zh ? "同条件评分比较" : "Equal-condition score comparison"}
    >
      <p>
        {zh ? "此次已保存的比较指标：" : "Metrics in this saved comparison: "}
        {result.request.metrics
          .map((name) => scoreLabel(name, language))
          .join(" · ")}
      </p>
      {result.groups.map((group, index) => (
        <div className="score-comparison-group" key={group.condition_sha256}>
          <strong>
            {zh ? "条件组 " : "Condition group "}
            {index + 1}
          </strong>
          <div
            className="pose-table"
            tabIndex={0}
            role="region"
            aria-label={zh ? "评分比较表" : "Score comparison table"}
          >
            <table>
              <thead>
                <tr>
                  <th>{zh ? "姿势" : "Pose"}</th>
                  <th>{zh ? "比较层" : "Pareto front"}</th>
                  <th>{zh ? "原生分数" : "Native scores"}</th>
                </tr>
              </thead>
              <tbody>
                {[...group.poses]
                  .sort((a, b) => (a.front ?? Infinity) - (b.front ?? Infinity))
                  .map((p) => {
                    const source = sources.get(p.selection.step_id);
                    return (
                      <tr key={p.selection.step_id + ":" + p.selection.record}>
                        <td>
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={!source}
                            title={p.selection.step_id}
                            onClick={() =>
                              onSelect(p.selection.step_id, p.selection.record)
                            }
                          >
                            {source ? (
                              <>
                                {zh ? "受体 " : "Receptor "}
                                {source.member_index + 1} ·{" "}
                                {zh ? "分子 " : "Ligand "}
                                {source.ligand_index + 1} ·{" "}
                                {zh ? "姿势 " : "Pose "}
                                {p.selection.record + 1}
                              </>
                            ) : zh ? (
                              "来源组合不可用"
                            ) : (
                              "Source combination unavailable"
                            )}
                          </button>
                        </td>
                        <td>
                          {p.front ??
                            (zh ? "缺少指标：" : "Missing metrics: ") +
                              p.missing_metrics
                                .map((name) => scoreLabel(name, language))
                                .join(", ")}
                        </td>
                        <td>
                          {p.scores.map((s) => (
                            <span key={s.name}>
                              {scoreLabel(s.name, language)}:{" "}
                              {s.value.toFixed(3)} {s.unit}{" "}
                            </span>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <details>
            <summary>
              {zh
                ? "核对本组计算条件"
                : "Inspect this group's computation conditions"}
            </summary>
            <pre>{JSON.stringify(group.conditions, null, 2)}</pre>
          </details>
        </div>
      ))}
    </section>
  );
}
