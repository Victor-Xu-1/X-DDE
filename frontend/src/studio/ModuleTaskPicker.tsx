import { useRef, useState } from "react";
import { MethodSwitch } from "./MethodSwitch";
import { BindingEntryDialog } from "./BindingEntryDialog";
import type { ToolId } from "../operations/catalog";
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
  const [guide, setGuide] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const module = moduleForTool(value),
    zh = language === "zh";
  if (!module)
    return (
      <MethodSwitch value={value} language={language} onChange={onChange} />
    );
  const extra = module.tools.filter((id) => !module.recommended.includes(id));
  return (
    <div
      className={`module-task-picker ${module.id === "binding" || module.id === "structures" ? "binding-task-picker" : ""}`}
    >
      <label>
        {zh ? "研究任务" : "Research task"}
        <select
          value={value}
          title={toolLabel(value, language)}
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
      {(module.id === "binding" || module.id === "structures") && (
        <>
          <button
            ref={trigger}
            type="button"
            className="secondary-button binding-entry-trigger"
            onClick={() => setGuide(true)}
          >
            {zh ? "按已有材料开始" : "Start from my evidence"}
          </button>
          {guide && (
            <BindingEntryDialog
              language={language}
              onSelect={onChange}
              onClose={() => {
                setGuide(false);
                trigger.current?.focus();
              }}
            />
          )}
        </>
      )}
      <MethodSwitch value={value} language={language} onChange={onChange} />
    </div>
  );
}
