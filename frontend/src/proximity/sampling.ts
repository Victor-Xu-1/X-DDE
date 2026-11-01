import { samplingSizes } from "./generated";
import type { ProximityMechanism, TernarySampleCount } from "./types";
import type { Language } from "../types";

export type SamplingValue = `${TernarySampleCount}`;

export function samplingOptions(
  language: Language,
  mechanism: ProximityMechanism,
) {
  const zh = language === "zh";
  const labels: Record<TernarySampleCount, [string, string, string, string]> = {
    3: [
      "初步探索 · 推荐",
      "Initial exploration · recommended",
      "3 个装配，先查看几何与两端保持情况。",
      "3 assemblies to inspect geometry and arm retention.",
    ],
    10: [
      "更多比较",
      "Broader comparison",
      "10 个装配，比较不同空间排列。",
      "10 assemblies to compare alternative arrangements.",
    ],
    20: [
      "扩展探索",
      "Extended exploration",
      "20 个装配，需要更长的计算时间。",
      "20 assemblies; requires more compute time.",
    ],
    40:
      mechanism === "protac"
        ? [
            "详细 PROTAC 探索 · 40",
            "Detailed PROTAC exploration · 40",
            "请求 40 个装配；保持所选资源上限，仍须检查几何。",
            "Request 40 assemblies; keep the chosen resource limits and inspect geometry.",
          ]
        : [
            "扩大比较 · 40",
            "Expanded comparison · 40",
            "40 个装配，需要更长时间；不是质量或功能保证。",
            "40 assemblies; longer compute time does not imply quality or activity.",
          ],
  };
  return samplingSizes.map((size) => ({
    value: String(size) as SamplingValue,
    title: labels[size][zh ? 0 : 1],
    note: labels[size][zh ? 2 : 3],
  }));
}
