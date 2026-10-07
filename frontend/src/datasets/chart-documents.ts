import type { DatasetArtifact } from "./types";

export interface SequencingDocument {
  reads: number;
  decoded: number;
  mean_quality: number[];
}
export interface CountDocument {
  samples: { column: string; depth: number }[];
  correlation_logcpm_pearson: number[][];
  correlation_available: boolean[][];
}
export interface SeriesRow {
  kind: string;
  block_a: string;
  block_b: string;
  score: number;
  members: number;
}
export interface ChartDocuments {
  sequencing_quality?: SequencingDocument;
  count_quality?: CountDocument;
  barcode_quality?: { cycles: { set: string; members: number }[] };
  del_series_visualization?: { series: SeriesRow[] };
  independent_holdout_evaluation?: {
    heldout_predictions: { observed: number; predicted: number }[];
  };
  research_model_application?: {
    heldout_predictions: { observed: number; predicted: number }[];
  };
}
export const chartRoles = new Set<keyof ChartDocuments>([
  "sequencing_quality",
  "count_quality",
  "barcode_quality",
  "del_series_visualization",
  "independent_holdout_evaluation",
  "research_model_application",
]);

export function chartArtifacts(artifacts: DatasetArtifact[]) {
  return artifacts.filter(
    (file) =>
      file.format === "json" &&
      chartRoles.has(file.role as keyof ChartDocuments),
  );
}
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const count = (value: unknown): value is number =>
  finite(value) && Number.isSafeInteger(value) && value >= 0;
const numbers = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every(finite);

export function validateChartDocument(role: string, value: unknown) {
  if (!object(value)) throw new Error("Invalid chart data");
  let valid = false;
  if (role === "sequencing_quality") {
    valid =
      count(value.reads) &&
      count(value.decoded) &&
      value.decoded <= value.reads &&
      numbers(value.mean_quality) &&
      value.mean_quality.every((n) => n >= 0);
  } else if (role === "count_quality") {
    const samples = value.samples;
    valid =
      Array.isArray(samples) &&
      samples.every(
        (row) =>
          object(row) &&
          typeof row.column === "string" &&
          finite(row.depth) &&
          row.depth >= 0,
      );
    if (valid && Array.isArray(samples)) {
      const size = samples.length;
      const matrix = value.correlation_logcpm_pearson;
      const mask = value.correlation_available;
      valid =
        Array.isArray(matrix) &&
        matrix.length === size &&
        matrix.every(
          (row) =>
            numbers(row) &&
            row.length === size &&
            row.every((n) => n >= -1 && n <= 1),
        ) &&
        Array.isArray(mask) &&
        mask.length === size &&
        mask.every(
          (row) =>
            Array.isArray(row) &&
            row.length === size &&
            row.every((n) => typeof n === "boolean"),
        );
    }
  } else if (role === "barcode_quality") {
    valid =
      Array.isArray(value.cycles) &&
      value.cycles.every(
        (row) =>
          object(row) && typeof row.set === "string" && count(row.members),
      );
  } else if (role === "del_series_visualization") {
    valid =
      Array.isArray(value.series) &&
      value.series.every(
        (row) =>
          object(row) &&
          typeof row.kind === "string" &&
          typeof row.block_a === "string" &&
          (row.kind !== "di" || typeof row.block_b === "string") &&
          finite(row.score) &&
          count(row.members),
      );
  } else if (
    role === "independent_holdout_evaluation" ||
    role === "research_model_application"
  ) {
    valid =
      Array.isArray(value.heldout_predictions) &&
      value.heldout_predictions.every(
        (row) => object(row) && finite(row.observed) && finite(row.predicted),
      );
  }
  if (!valid) throw new Error("Invalid chart data");
  return value;
}
