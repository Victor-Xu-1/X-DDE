export const evidenceLabels: Record<string, [string, string]> = {
  low_selection_count: ["靶点计数较低", "Low target count"],
  "reference_not_observed; not proven_absent": [
    "对照未检出，不能视为不存在",
    "Reference unobserved, not proven absent",
  ],
  "single_replicate; biological_reproducibility_unassessed": [
    "单个重复，尚未评估生物学重复性",
    "Single replicate; biological reproducibility unassessed",
  ],
  replicate_variation: ["重复之间差异较大", "High replicate variation"],
};
export function evidenceNotes(value: unknown, zh: boolean): string[] {
  if (typeof value !== "string") return [];
  let flags: unknown;
  try {
    flags = JSON.parse(value);
  } catch {
    return [value];
  }
  return Array.isArray(flags)
    ? flags
        .filter((v): v is string => typeof v === "string")
        .map((v) => evidenceLabels[v]?.[zh ? 0 : 1] ?? v)
    : [];
}
