import type { Language } from "../types";
import {
  ResearchTable,
  type ResearchColumn,
} from "../presentation/ResearchTable";
import type { DockingResult } from "./types";
import { scoreLabel } from "./scoreLabels";
type Pose = DockingResult["poses"][number];
function MetricHeading({
  label,
  short,
  caption,
}: {
  label: string;
  short: string;
  caption: string;
}) {
  return (
    <>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="pose-metric-heading">
        <span>{short}</span>
        <small>{caption}</small>
      </span>
    </>
  );
}
export function PoseTable({
  result,
  language,
  selected,
  onSelect,
  onDiagnostic,
}: {
  result: DockingResult;
  language: Language;
  selected: number | null;
  onSelect(pose: Pose): void;
  onDiagnostic(artifact: string): void;
}) {
  const zh = language === "zh";
  const referenceReady = result.reference_comparison?.status === "ready";
  const showQualification = result.poses.some(
    (pose) => !pose.valid || Boolean(pose.constraint_checks?.length),
  );
  const scoreNames = [
    ...new Map(
      result.poses.flatMap((p) =>
        p.scores.map(
          (score) => [score.name + ":" + score.unit, score] as const,
        ),
      ),
    ).values(),
  ];
  const columns: ResearchColumn<Pose>[] = [
    {
      key: "pose",
      label: zh ? "姿势" : "Pose",
      value: (p) => (zh ? "姿势 " : "Pose ") + (p.record + 1),
      render: (p) => (
        <div className="pose-record">
          <span>
            <button
              type="button"
              className="record-select"
              disabled={!p.valid || !p.artifact}
              aria-pressed={selected === p.record}
              onClick={() => onSelect(p)}
            >
              {zh ? "姿势" : "Pose"} {p.record + 1}
            </button>
            {p.diagnostic_artifact && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => onDiagnostic(p.diagnostic_artifact!)}
              >
                {zh ? "检查不合格姿势" : "Inspect rejected pose"}
              </button>
            )}
          </span>
        </div>
      ),
    },
    ...scoreNames.map((score) => ({
      key: score.name + ":" + score.unit,
      exportLabel:
        scoreLabel(score.name, language) +
        (score.unit === "model_output" ? "" : " (" + score.unit + ")"),
      label: (
        <MetricHeading
          label={
            scoreLabel(score.name, language) +
            (score.unit === "model_output" ? "" : " (" + score.unit + ")")
          }
          short={
            score.name === "minimizedAffinity"
              ? zh
                ? "评分"
                : "Score"
              : score.name === "CNNscore"
                ? zh
                  ? "模型姿势"
                  : "CNN pose"
                : zh
                  ? "模型结合"
                  : "CNN binding"
          }
          caption={
            score.unit === "model_output" ? (zh ? "分数" : "score") : score.unit
          }
        />
      ),
      numeric: true,
      value: (p: Pose) =>
        p.scores.find(
          (value) => value.name === score.name && value.unit === score.unit,
        )?.value,
      render: (p: Pose) => {
        const value = p.scores.find(
          (value) => value.name === score.name && value.unit === score.unit,
        );
        return (
          <span
            title={
              zh
                ? "原生方法与单位；不能换算为 KD 或 IC50。"
                : "Native method and unit; not KD or IC50."
            }
          >
            {value ? value.value.toFixed(3) : "—"}
            {score.unit === "model_output" && (
              <small className="evidence-description">
                {zh ? "模型输出" : "model output"}
              </small>
            )}
          </span>
        );
      },
    })),
    ...(referenceReady
      ? ([
          {
            key: "reference_all_heavy",
            exportLabel: zh ? "整体偏差 (Å)" : "Whole-pose RMSD (Å)",
            label: (
              <MetricHeading
                label={zh ? "整体偏差 (Å)" : "Whole-pose RMSD (Å)"}
                short={zh ? "整体 RMSD" : "Whole RMSD"}
                caption="Å"
              />
            ),
            numeric: true,
            value: (p: Pose) => p.reference_rmsd?.all_heavy,
            render: (p: Pose) => p.reference_rmsd?.all_heavy.toFixed(3) ?? "—",
          },
          {
            key: "reference_contact",
            exportLabel: zh ? "接触区偏差 (Å)" : "Contact RMSD (Å)",
            label: (
              <MetricHeading
                label={zh ? "接触区偏差 (Å)" : "Contact RMSD (Å)"}
                short={zh ? "接触区 RMSD" : "Contact RMSD"}
                caption="Å"
              />
            ),
            numeric: true,
            value: (p: Pose) => p.reference_rmsd?.contact,
            render: (p: Pose) => p.reference_rmsd?.contact?.toFixed(3) ?? "—",
          },
        ] satisfies ResearchColumn<Pose>[])
      : []),
    {
      key: "mapping",
      label: zh ? "原子映射" : "Atom mapping",
      value: (p) => p.mapping_status,
      render: (p) => (
        <span title={p.mapping_status}>
          {p.mapping_status === "ambiguous_reconfirm_selections"
            ? zh
              ? "重选原子区域"
              : "Reselect atom regions"
            : p.mapping_status === "unavailable"
              ? "—"
              : zh
                ? "已记录"
                : "Recorded"}
        </span>
      ),
    },
    {
      key: "status",
      label: zh ? "状态" : "Status",
      value: (p) => p.valid,
      render: (p) => (
        <span className="pose-qualification">
          {p.valid
            ? zh
              ? "可复用候选"
              : "Reusable candidate"
            : p.constraint_checks?.some(
                  (c) => c.strength === "hard" && !c.passed,
                )
              ? zh
                ? "已排除：未满足硬空间条件"
                : "Excluded: hard spatial condition failed"
              : p.reason}
          {p.constraint_checks?.map((c) => (
            <small className="evidence-description" key={c.condition_id}>
              {c.passed
                ? zh
                  ? "空间条件通过"
                  : "Spatial condition passed"
                : zh
                  ? "空间条件未通过"
                  : "Spatial condition failed"}{" "}
              · {c.maximum_excess.toFixed(3)} Å
            </small>
          ))}
        </span>
      ),
    },
  ];
  return (
    <ResearchTable
      rows={result.poses}
      columns={columns}
      rowId={(p) => String(p.record)}
      selected={selected == null ? null : String(selected)}
      onSelect={onSelect}
      canSelect={(pose) => pose.valid && !!pose.artifact}
      language={language}
      title={"GNINA " + result.software_version}
      initialVisibleColumns={
        referenceReady
          ? [
              "pose",
              "minimizedAffinity:kcal/mol",
              "CNNscore:model_output",
              "reference_all_heavy",
              "reference_contact",
              ...(showQualification ? ["status"] : []),
            ]
          : scoreNames.length
            ? [
                "pose",
                ...scoreNames.map((score) => score.name + ":" + score.unit),
                ...(showQualification ? ["status"] : []),
              ]
            : undefined
      }
    />
  );
}
