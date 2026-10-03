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
  const text = templateGuide(example.module.capability_id, language).steps[
    step
  ];
  return (
    <p className="template-step-help" role="note">
      <strong>{language === "zh" ? "模板提示：" : "Template tip: "}</strong>
      {text}
    </p>
  );
}
