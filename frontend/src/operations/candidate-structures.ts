import type { Job } from "../types";
import type { OperationResult } from "./types";
import { unwrapResult } from "../presentation/research-content";
import { record } from "./candidate-sequence-model";

export function resultStructureFiles(data: OperationResult) {
  return [
    ...new Set([
      ...(Array.isArray(data.structures)
        ? data.structures.filter(
            (file): file is string => typeof file === "string",
          )
        : []),
      ...(typeof data.structure === "string" ? [data.structure] : []),
    ]),
  ];
}

export function sequenceCandidateResult(job: Job, data: OperationResult) {
  if (
    job.request.operation !== "harness" ||
    !["esm2", "mpnn", "fold"].includes(job.request.tool)
  )
    return null;
  const value = record(unwrapResult(data.result ?? data));
  if (value.available === false || value.error) return null;
  return Array.isArray(value.candidates) &&
    value.candidates.length > 0 &&
    value.candidates.every(
      (item) => item && typeof item === "object" && !Array.isArray(item),
    )
    ? (value.candidates as Record<string, unknown>[])
    : null;
}

/** Native file links, never array position or a guessed correspondence by count. */
export function candidateStructure(
  value: Record<string, unknown>,
  available: readonly string[],
) {
  const explicit = value.structure_path;
  const nested = record(record(value.metadata).fold).structure_path;
  const raw = explicit === undefined || explicit === null ? nested : explicit;
  const name =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw) && raw.length === 1
        ? raw[0]
        : null;
  return typeof name === "string" &&
    available.includes(name) &&
    !name.includes("\\") &&
    !name.split("/").includes("..") &&
    /\.(?:cif|mmcif|pdb)$/i.test(name)
    ? name
    : null;
}
