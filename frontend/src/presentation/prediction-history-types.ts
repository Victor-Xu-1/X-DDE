import type { PreviewComponent } from "./PredictionEntityPreview";
import type { MoleculeRef } from "../research/types";

export type HistoryLabel = readonly [string, string];
export interface HistoryFile {
  label: HistoryLabel;
  id?: string;
  reference?: MoleculeRef;
}
export interface HistoryEntity {
  component: PreviewComponent;
  files: HistoryFile[];
  molecularFile?: HistoryFile;
}
export interface HistoryStudy {
  entities: HistoryEntity[];
  settings: { label: HistoryLabel; value: string | number | boolean }[];
}
export function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function integer(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max
  );
}
export function text(value: unknown, max = 20000): value is string {
  return typeof value === "string" && value.length <= max;
}
export function assetId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
  );
}
export function reference(value: unknown): MoleculeRef | null {
  const item = object(value);
  if (
    !item ||
    !assetId(item.asset_id) ||
    typeof item.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(item.sha256) ||
    !integer(item.record, 0, 10000) ||
    !integer(item.conformer, 0, 10000) ||
    (item.version_id != null && !assetId(item.version_id))
  )
    return null;
  return item as unknown as MoleculeRef;
}
export function addSettings(
  study: HistoryStudy,
  data: Record<string, unknown>,
  fields: readonly (readonly [string, string, string])[],
) {
  for (const [key, zh, en] of fields) {
    const value = data[key];
    if (
      (typeof value === "number" && Number.isFinite(value)) ||
      typeof value === "boolean" ||
      (text(value, 120) && value.length > 0)
    )
      study.settings.push({ label: [zh, en], value });
  }
}
