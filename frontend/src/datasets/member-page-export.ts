import { csvCell } from "../presentation/table-model";
import type { TableRow } from "./ResearchTable";

/** Export the currently loaded page only, with full native values and source keys. */
export function memberPageCsv(jobId: string, rows: TableRow[]) {
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return (
    "\uFEFF" +
    [
      ["dataset_job", ...fields].map(csvCell).join(","),
      ...rows.map((row) =>
        [jobId, ...fields.map((field) => row[field])].map(csvCell).join(","),
      ),
    ].join("\r\n")
  );
}
