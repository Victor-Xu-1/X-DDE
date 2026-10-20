import type { TableRow } from "./ResearchTable";

/** Keep reported text and numeric relations distinct without duplicating an observation. */
export function followupObservation(row: TableRow): string {
  const note = typeof row.qualifier === "string" ? row.qualifier.trim() : "";
  if (row.value == null) return note || "—";
  const relation =
    typeof row.relation === "string" && row.relation !== "="
      ? row.relation
      : "";
  const value = `${relation}${String(row.value)}`;
  return note ? `${value} · ${note}` : value;
}
