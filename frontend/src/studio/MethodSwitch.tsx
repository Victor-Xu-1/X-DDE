import { useRef } from "react";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { ToolId } from "../operations/catalog";
import { methodChoices } from "./method-choices";
import "./method-switch.css";
import { researchText } from "../presentation/research-content";
import { ActiveIndicator } from "../presentation/ActiveIndicator";

type MethodOption = (typeof methodChoices)[number]["options"][number];
function MethodButton({
  option,
  selected,
  preferred,
  language,
  onChange,
}: {
  option: MethodOption;
  selected: boolean;
  preferred: boolean;
  language: Language;
  onChange(tool: ToolId): void;
}) {
  const availability = useTaskReadiness(option.id),
    zh = language === "zh";
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={option.note[zh ? 0 : 1]}
      onClick={() => {
        if (!selected) onChange(option.id);
      }}
    >
      {researchText(option.label, zh)}
      {preferred && <small>{zh ? "默认" : "Default"}</small>}
      {availability.error ? (
        <small>{zh ? "暂无法确认" : "Status unavailable"}</small>
      ) : availability.ready === undefined ? (
        <small>{zh ? "正在检查…" : "Checking…"}</small>
      ) : availability.ready === false ? (
        <small>{zh ? "未配置" : "Not configured"}</small>
      ) : null}
    </button>
  );
}
export function MethodSwitch({
  value,
  language,
  onChange,
}: {
  value: ToolId;
  language: Language;
  onChange(tool: ToolId): void;
}) {
  const group = methodChoices.find((group) =>
      group.options.some((option) => option.id === value),
    ),
    zh = language === "zh";
  const track = useRef<HTMLDivElement>(null);
  if (!group) return null;
  return (
    <div
      ref={track}
      className="task-model-switch"
      role="group"
      aria-label={zh ? "后端模型" : "Backend method"}
    >
      <span>{zh ? "后端模型" : "Backend"}</span>
      {group.options.map((option) => (
        <MethodButton
          key={option.id}
          option={option}
          selected={value === option.id}
          preferred={group.default === option.id}
          language={language}
          onChange={onChange}
        />
      ))}
      <ActiveIndicator container={track} selection={value + ":" + language} />
      <Hint label={zh ? "如何选择模型？" : "How to choose a model?"}>
        <p>{group.default_basis[zh ? 0 : 1]}</p>
        {group.options.map((option) => (
          <p key={option.id}>
            {researchText(option.label, zh)}: {option.note[zh ? 0 : 1]}
          </p>
        ))}
        <p>
          {zh
            ? "切换后请按所选方法重新确认材料与参数；历史任务和研究文件保留。不同方法的原始分数不可直接排名。"
            : "After switching, review the selected method's inputs and parameters. Historical jobs and research files remain available. Raw scores from different methods are not directly rankable."}
        </p>
      </Hint>
    </div>
  );
}
