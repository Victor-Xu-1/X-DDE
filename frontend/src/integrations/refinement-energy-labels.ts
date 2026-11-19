import type { Language } from "../types";

export function refinementMetricLabel(name: string, language: Language) {
  const zh = language === "zh";
  switch (name) {
    case "Initial potential energy":
      return zh ? "优化前势能" : "Initial energy";
    case "Final potential energy":
      return zh ? "优化后势能" : "Final energy";
    default:
      return name;
  }
}
