import type { Language } from "../types";
import "./example-stage-navigation.css";

export function ExampleStageNavigation({
  stages,
  selected,
  language,
  onSelect,
  kind = "study",
}: {
  stages: { id: string; label: string }[];
  selected: string;
  language: Language;
  onSelect(id: string): void;
  kind?: "study" | "workflow";
}) {
  const zh = language === "zh";
  const index = stages.findIndex(({ id }) => id === selected);
  const previous = stages[index - 1];
  const next = stages[index + 1];
  const workflow = kind === "workflow";
  const label = workflow
    ? zh
      ? "工作流步骤"
      : "Workflow step"
    : zh
      ? "研究阶段结果"
      : "Study result stage";
  return (
    <nav
      className="example-stage-navigation"
      aria-label={
        workflow
          ? zh
            ? "工作流步骤导航"
            : "Workflow step navigation"
          : zh
            ? "研究阶段导航"
            : "Study stage navigation"
      }
    >
      <label>
        <span>{label}</span>
        <select
          aria-label={label}
          value={selected}
          onChange={(event) => onSelect(event.target.value)}
        >
          {stages.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="example-stage-buttons">
        <button
          type="button"
          aria-label={
            workflow
              ? zh
                ? "上一个工作流步骤"
                : "Previous workflow step"
              : zh
                ? "上一个研究阶段"
                : "Previous study stage"
          }
          title={previous?.label}
          disabled={!previous}
          onClick={() => previous && onSelect(previous.id)}
        >
          ‹
        </button>
        <span
          aria-label={
            zh ? "当前阶段 / 总阶段数" : "Current stage / total stages"
          }
        >
          {index + 1} / {stages.length}
        </span>
        <button
          type="button"
          aria-label={
            workflow
              ? zh
                ? "下一个工作流步骤"
                : "Next workflow step"
              : zh
                ? "下一个研究阶段"
                : "Next study stage"
          }
          title={next?.label}
          disabled={!next}
          onClick={() => next && onSelect(next.id)}
        >
          ›
        </button>
      </div>
    </nav>
  );
}
