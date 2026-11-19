import type { MolecularColorKey } from "../publication/molecular-color-key";
import type { Language } from "../types";
import { confidenceColors } from "./confidence-types";
import {
  surfaceChargeRange,
  type SurfaceSummary,
  type ViewMode,
} from "./protocol";
import { isPotentialRange } from "./potential-range";

export const confidenceMarks = [...confidenceColors]
  .reverse()
  .map((color, index) => ({
    color,
    label: ["> 90", "70–90", "50–<70", "< 50"][index],
  }));

export function scientificColorKeys({
  mode,
  confidence,
  hasPotentialMap,
  potentialRange,
  surface,
  language,
}: {
  mode: ViewMode;
  confidence: boolean;
  hasPotentialMap: boolean;
  potentialRange?: number;
  surface?: SurfaceSummary | null;
  language: Language;
}): MolecularColorKey[] {
  const zh = language === "zh";
  const keys: MolecularColorKey[] = [];
  if (confidence)
    keys.push({
      title: zh
        ? "pLDDT · 聚合物置信度（0–100）"
        : "pLDDT · Polymer confidence (0–100)",
      kind: "bands",
      marks: confidenceMarks,
    });
  if (mode !== "surface") return keys;
  if (hasPotentialMap) {
    if (isPotentialRange(potentialRange))
      keys.push({
        title: zh ? "APBS 电势 (kBT/e)" : "APBS potential (kBT/e)",
        kind: "scale",
        ticks: [`−${potentialRange}`, "0", `+${potentialRange}`],
      });
  } else if (surface) {
    const missing =
      surface.missing > 0
        ? {
            color: "#b1b7c1",
            label: zh ? "灰色 · 无电荷数据" : "Gray · no charge data",
          }
        : undefined;
    const title =
      surface.estimated > 0
        ? zh
          ? "近似部分电荷 (e)"
          : "Approximate partial charge (e)"
        : zh
          ? "部分电荷 (e)"
          : "Partial charge (e)";
    keys.push(
      surface.missing === surface.total
        ? { title, kind: "bands", marks: [], missing }
        : {
            title,
            kind: "scale",
            ticks: [`−${surfaceChargeRange}`, "0", `+${surfaceChargeRange}`],
            missing,
          },
    );
  }
  return keys;
}
