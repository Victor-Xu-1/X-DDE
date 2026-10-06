import type { Language } from "../types";
import type { AvailableDataset } from "./types";

export function datasetName(item: AvailableDataset, language: Language) {
  return item.label?.[language === "zh" ? 0 : 1] ?? item.name;
}
