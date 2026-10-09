import guides from "./guide-data.json";
import type { Language } from "../types";
import type { StudyContext } from "./types";

export function templateGuide(
  capability: string,
  language: Language,
  study?: StudyContext | null,
) {
  const index = language === "zh" ? 0 : 1;
  if (study)
    return {
      steps: [
        ...study.guide.steps.map((value) => value[index]),
        ...study.required_materials.map((value) => value[index]),
      ],
      interpretation: study.guide.interpretation[index],
    };
  const guide = guides[capability as keyof typeof guides];
  if (!guide)
    throw new Error("No reviewed module template guide: " + capability);
  return {
    steps: guide.steps.map((value) => value[index]),
    interpretation: guide.interpretation[index],
  };
}
