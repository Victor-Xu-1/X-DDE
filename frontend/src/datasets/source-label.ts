import type { Language } from "../types";
import type { AvailableDataset } from "./types";
import { researchDate } from "../presentation/research-date";

export function datasetName(item: AvailableDataset, language: Language) {
  return item.label?.[language === "zh" ? 0 : 1] ?? item.name;
}

/** Duplicate captions remain distinct even for missing dates or same-second tasks. */
export function datasetSourceCaptions(
  items: AvailableDataset[],
  language: Language,
) {
  const groups = new Map<string, string[]>();
  const key = (item: AvailableDataset) =>
    `${datasetName(item, language)}\0${researchDate(item.created_at, language)}`;
  for (const item of items) {
    const group = groups.get(key(item)) ?? [];
    group.push(item.job_id);
    groups.set(key(item), group);
  }
  for (const group of groups.values()) group.sort();
  return new Map(
    items.map((item) => {
      const group = groups.get(key(item))!;
      const parts = [researchDate(item.created_at, language)];
      if (group.length > 1) parts.push(`#${group.indexOf(item.job_id) + 1}`);
      return [item.job_id, parts.filter(Boolean).join(" · ")];
    }),
  );
}
