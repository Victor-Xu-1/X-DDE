import type { Component, Parameters, Prediction } from "./types";
import type { MessageKey } from "./i18n";

export const defaults: Parameters = {
  seed: 101,
  samples: 1,
  steps: 200,
  cycles: 10,
  dtype: "bf16",
};
export function normalizeProtein(value: string): string {
  const lines = value.trim().split(/\r?\n/);
  const headers = lines.filter((line) => line.trim().startsWith(">"));
  const singleFasta = headers.length === 1 && lines[0]?.trim().startsWith(">");
  return (singleFasta ? lines.slice(1).join("") : value)
    .replace(/\s/g, "")
    .toUpperCase();
}
export function validate(
  name: string,
  components: Component[],
): MessageKey | null {
  if (!name.trim()) return "requiredName";
  if (!components.length || components.some((item) => !item.value.trim()))
    return "requiredInput";
  if (
    components.some(
      (item) =>
        item.kind === "protein" &&
        !/^[ACDEFGHIKLMNPQRSTVWYX]+$/.test(normalizeProtein(item.value)),
    )
  )
    return "invalidProtein";
  if (
    components.some(
      (item) =>
        (item.kind === "dna" &&
          !/^[ATGCNX]+$/.test(normalizeProtein(item.value))) ||
        (item.kind === "rna" &&
          !/^[AUGCNX]+$/.test(normalizeProtein(item.value))),
    )
  )
    return "invalidNucleic";
  if (
    components.some(
      (item) =>
        item.kind === "ion" &&
        !["MG", "ZN", "CA", "NA", "K", "CL", "MN", "FE", "CU", "CO"].includes(
          item.value.trim().toUpperCase(),
        ),
    )
  )
    return "invalidIon";
  if (
    components.some(
      (item) =>
        item.kind === "ligand" &&
        (/\s|:\/\//.test(item.value.trim()) ||
          item.value.trim().startsWith("FILE_")),
    )
  )
    return "invalidLigand";
  return null;
}
export function prediction(
  name: string,
  components: Component[],
  parameters: Parameters,
): Prediction {
  return {
    name: name.trim(),
    components: components.map((item) => ({
      ...item,
      value: ["protein", "dna", "rna"].includes(item.kind)
        ? normalizeProtein(item.value)
        : item.kind === "ion"
          ? item.value.trim().toUpperCase()
          : item.value.trim(),
    })),
    parameters,
  };
}
