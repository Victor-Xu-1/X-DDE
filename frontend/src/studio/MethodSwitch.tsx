import { useEffect, useState } from "react";
import { request } from "../api";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import type { ToolId } from "../operations/catalog";
import { methodChoices } from "./method-choices";
import "./method-switch.css";
import { researchText } from "../presentation/research-content";
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
  const [ready, setReady] = useState<Record<string, boolean | null>>({});
  useEffect(() => {
    if (!group) return;
    const controller = new AbortController();
    void Promise.all(
      group.options.map(async (option) => {
        try {
          const info = await request<{
            availability: { configuration_present: boolean };
          }>("/capabilities/" + option.id, { signal: controller.signal });
          return [option.id, info.availability.configuration_present] as const;
        } catch {
          return [option.id, null] as const;
        }
      }),
    ).then((rows) => {
      if (!controller.signal.aborted) setReady(Object.fromEntries(rows));
    });
    return () => controller.abort();
  }, [group]);
  if (!group) return null;
  return (
    <div
      className="task-model-switch"
      role="group"
      aria-label={zh ? "后端模型" : "Backend method"}
    >
      <span>{zh ? "后端模型" : "Backend"}</span>
      {group.options.map((option) => (
        <button
          type="button"
          key={option.id}
          aria-pressed={value === option.id}
          title={option.note[zh ? 0 : 1]}
          onClick={() => {
            if (value !== option.id) onChange(option.id);
          }}
        >
          {researchText(option.label, zh)}
          {group.default === option.id && (
            <small>{zh ? "默认" : "Default"}</small>
          )}
          {ready[option.id] === false && (
            <small>{zh ? "未配置" : "Not configured"}</small>
          )}
        </button>
      ))}
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
