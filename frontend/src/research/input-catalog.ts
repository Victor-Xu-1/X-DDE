import type { Asset } from "../operations/types";
import type { MoleculeRef, ScientificObject } from "./types";
export interface InputSourceTask {
  id: string;
  name: string;
}
export interface InputChoice {
  key: string;
  origin: "upload" | "saved";
  label: string;
  created_at: string;
  asset: Asset;
  reference: MoleculeRef;
  version: ScientificObject | null;
  source_task?: InputSourceTask | null;
}
export interface InputCatalog {
  items: InputChoice[];
  selected: InputChoice | null;
  total: number;
  offset: number;
  limit: number;
}
export function inputChoiceKey(value: MoleculeRef | null, wholeFile = false) {
  return value
    ? value.version_id && !wholeFile
      ? "version:" + value.version_id
      : "file:" + value.asset_id
    : "";
}
export function referenceKey(value: MoleculeRef | null) {
  return value
    ? [
        value.asset_id,
        value.sha256,
        value.record,
        value.conformer,
        value.version_id ?? "",
      ].join(":")
    : "";
}
