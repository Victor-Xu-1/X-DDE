import type { Parameters } from "../types";

export type IntegerField = "additional_seeds" | "gpu_ids";
export type IntegerText = Partial<Record<IntegerField, string>>;
export const integerLimits = {
  additional_seeds: { max: 4294967295, count: 7 },
  gpu_ids: { max: 63, count: 8 },
} as const;
export function readIntegerList(raw: string, max: number, count: number) {
  const parts = raw.split(/[,，\s]+/).filter(Boolean),
    values = parts.map(Number);
  return {
    values,
    valid:
      parts.every((part) => /^\d+$/.test(part)) &&
      values.every((value) => Number.isSafeInteger(value) && value <= max) &&
      values.length <= count &&
      new Set(values).size === values.length,
  };
}
export function validIntegerTexts(parameters: Parameters, text: IntegerText) {
  for (const field of ["additional_seeds", "gpu_ids"] as const) {
    const { max, count } = integerLimits[field];
    const saved = parameters[field] ?? [];
    const parsed = readIntegerList(text[field] ?? saved.join(","), max, count);
    if (
      !parsed.valid ||
      parsed.values.length !== saved.length ||
      parsed.values.some((value, i) => value !== saved[i])
    )
      return false;
  }
  const seeds = [parameters.seed, ...(parameters.additional_seeds ?? [])];
  return (
    seeds.every(
      (seed) => Number.isSafeInteger(seed) && seed >= 0 && seed <= 4294967295,
    ) &&
    new Set(seeds).size === seeds.length &&
    !(parameters.device === "cpu" && (parameters.gpu_ids?.length ?? 0) > 0)
  );
}
