import { useExample } from "./context";
import { templateGuide } from "./guide";
import type { Language } from "../types";

export function TemplateStepHelp({
  step,
  language,
}: {
  step: number;
  language: Language;
}) {
  const example = useExample();
  if (!example?.template_active || step > 3) return null;
  const text = templateGuide(
    example.module.capability_id,
    language,
    example.study,
  ).steps[step];
  return (
    <aside className="template-step-help" role="note">
      <p>
        <strong>{language === "zh" ? "模板提示：" : "Template tip: "}</strong>
        {text}
      </p>
      {step === 0 && Boolean(example.study?.required_materials.length) && (
        <p className="muted">
          {language === "zh" ? "需补充：" : "Additional inputs: "}
          {example
            .study!.required_materials.map(
              (value) => value[language === "zh" ? 0 : 1],
            )
            .join("; ")}
        </p>
      )}
    </aside>
  );
}
