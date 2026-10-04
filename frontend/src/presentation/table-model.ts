export type CellValue = string | number | boolean | null | undefined;
export interface SortOrder {
  key: string;
  direction: "ascending" | "descending";
}
export function compareValues(
  a: CellValue,
  b: CellValue,
  direction: SortOrder["direction"],
) {
  const missing = (v: CellValue) =>
    v == null || (typeof v === "number" && !Number.isFinite(v));
  if (missing(a) || missing(b)) return missing(a) ? (missing(b) ? 0 : 1) : -1;
  const order =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), undefined, {
          numeric: true,
          sensitivity: "base",
        });
  return direction === "ascending" ? order : -order;
}
export function csvCell(value: CellValue) {
  if (value == null || (typeof value === "number" && !Number.isFinite(value)))
    return '""';
  let text = String(value);
  if (typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(value))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
