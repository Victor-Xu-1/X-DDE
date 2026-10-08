import { scoreLabel } from "../docking/scoreLabels";
import type { Language } from "../types";
import type { PoseSet } from "./types";

export function PoseList({
  outcome,
  selected,
  language,
  onSelect,
}: {
  outcome: PoseSet["outcomes"][number];
  selected: number | null;
  language: Language;
  onSelect(record: number): void;
}) {
  const zh = language === "zh";
  return (
    <div
      className="pose-table pose-selection-table"
      tabIndex={0}
      role="region"
      aria-label={zh ? "原生姿势表" : "Native pose table"}
    >
      <table aria-label={zh ? "当前组合的姿势" : "Poses in this combination"}>
        <thead>
          <tr>
            <th scope="col">{zh ? "姿势" : "Pose"}</th>
            <th scope="col">
              {zh ? "原生分数与单位" : "Native score and units"}
            </th>
            <th scope="col">{zh ? "状态" : "Status"}</th>
          </tr>
        </thead>
        <tbody>
          {outcome.poses.map((pose) => (
            <tr
              key={pose.evidence.record}
              className={
                selected === pose.evidence.record ? "is-selected" : undefined
              }
            >
              <th scope="row">
                <button
                  className="result-row-button"
                  type="button"
                  disabled={!pose.reference}
                  aria-pressed={selected === pose.evidence.record}
                  onClick={() => onSelect(pose.evidence.record)}
                >
                  {zh ? "姿势 " : "Pose "}
                  {pose.evidence.record + 1}
                </button>
              </th>
              <td>
                {pose.evidence.scores.length
                  ? pose.evidence.scores.map((score) => (
                      <span
                        className="pose-native-metric"
                        key={score.name}
                        title={String(score.value)}
                      >
                        <small>{scoreLabel(score.name, language)}</small>
                        <strong>
                          {Number(score.value.toPrecision(6))}{" "}
                          <small>{score.unit}</small>
                        </strong>
                      </span>
                    ))
                  : "—"}
              </td>
              <td>
                {pose.reference
                  ? zh
                    ? "可查看"
                    : "Available"
                  : (pose.evidence.reason ?? (zh ? "未通过" : "Rejected"))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!outcome.poses.length && (
        <p role="status" className="field-help">
          {zh
            ? "此组合没有可用姿势。请选择其他组合，或查看原生任务。"
            : "No poses are available for this combination. Choose another combination or inspect its native attempt."}
        </p>
      )}
    </div>
  );
}
