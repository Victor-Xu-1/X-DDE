import type { Language } from "../types";
import type { ToolId } from "../operations/catalog";
import { researchModules } from "./research-modules";

/** Entry points describe a research sequence; they never claim a completed task. */
export function ResearchStageNavigation({
  language,
  onSelect,
}: {
  language: Language;
  onSelect(tool: ToolId): void;
}) {
  const zh = language === "zh",
    index = zh ? 0 : 1;
  const stages = researchModules.filter((module) => module.id !== "biologics");
  const biologics = researchModules.find(
    (module) => module.id === "biologics",
  )!;
  return (
    <nav
      className="research-stage-nav"
      aria-label={zh ? "研究阶段快捷入口" : "Research stage shortcuts"}
    >
      <ol>
        {stages.map((module, position) => (
          <li key={module.id}>
            <span className="research-stage-number" aria-hidden="true">
              {position + 1}
            </span>
            <button
              type="button"
              onClick={() => onSelect(module.defaultTool)}
              aria-label={
                zh
                  ? `进入${module.label[index]}`
                  : `Start ${module.label[index]}`
              }
            >
              {module.label[index]}
            </button>
            {module.id === "molecules" && (
              <button
                type="button"
                className="research-stage-alternative"
                onClick={() => onSelect(biologics.defaultTool)}
              >
                {zh ? "或：生物药研究" : "Or: biologics research"}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
