import type { Language } from "../types";
const names: Record<string, [string, string]> = {
  minimizedAffinity: ["经验对接分数", "Empirical docking score"],
  CNNscore: ["模型姿势分数", "CNN pose score"],
  CNNaffinity: ["模型结合分数", "CNN binding score"],
};
export function scoreLabel(name: string, language: Language) {
  return names[name]?.[language === "zh" ? 0 : 1] ?? name;
}
