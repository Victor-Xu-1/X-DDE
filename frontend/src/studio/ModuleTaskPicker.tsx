import { Hint } from "../guided/Hint";
import { tools, type ToolId } from "../operations/catalog";
import { moduleForTool, toolLabel } from "./research-modules";
import type { Language } from "../types";
export function ModuleTaskPicker({
  value,
  language,
  onChange,
}: {
  value: ToolId;
  language: Language;
  onChange(tool: ToolId): void;
}) {
  const module = moduleForTool(value),
    current = tools.find((tool) => tool.id === value),
    zh = language === "zh";
  if (!module) return null;
  const extra = module.tools.filter((id) => !module.recommended.includes(id));
  return (
    <div className="module-task-picker">
      <label>
        {zh ? "研究任务" : "Research task"}
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as ToolId)}
        >
          <optgroup label={zh ? "常用任务" : "Common tasks"}>
            {module.recommended.map((id) => (
              <option key={id} value={id}>
                {toolLabel(id, language)}
              </option>
            ))}
          </optgroup>
          {extra.length > 0 && (
            <optgroup label={zh ? "更多方法" : "Additional methods"}>
              {extra.map((id) => (
                <option key={id} value={id}>
                  {toolLabel(id, language)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {current && (
        <Hint label={zh ? "研究任务说明" : "Research task help"}>
          {current.note[zh ? 0 : 1]} · {current.source}
        </Hint>
      )}
    </div>
  );
}
