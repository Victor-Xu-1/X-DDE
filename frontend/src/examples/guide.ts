import guides from "./guide-data.json";
import type { Language } from "../types";

export function templateGuide(capability: string, language: Language) {
  const guide = guides[capability as keyof typeof guides];
  if (!guide)
    throw new Error("No reviewed module template guide: " + capability);
  const index = language === "zh" ? 0 : 1;
  return {
    steps: guide.steps.map((value) => value[index]),
    interpretation: guide.interpretation[index],
  };
}
