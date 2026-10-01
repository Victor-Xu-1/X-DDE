import type { MoleculeRef } from "../research/types";
import type { Job } from "../types";
import { defaults } from "./generated";
import type { SiteOptions } from "./types";
export function sameReference(a: MoleculeRef, b: MoleculeRef) {
  return (
    a.asset_id === b.asset_id &&
    a.sha256 === b.sha256 &&
    a.version_id === b.version_id &&
    a.record === b.record &&
    a.conformer === b.conformer
  );
}
export function eligibleJobs(jobs: Job[], reference: MoleculeRef) {
  return jobs.filter(
    (j) =>
      j.status === "succeeded" &&
      j.request.operation === "pocket_search" &&
      sameReference(j.request.protein, reference),
  );
}
export function preset(choice: string): SiteOptions {
  return choice === "strict"
    ? {
        ...defaults,
        maximum_center_distance: 5,
        minimum_jaccard: 0.5,
        minimum_mapping_coverage: 0.9,
        minimum_shared_residues: 3,
      }
    : choice === "exploratory"
      ? {
          ...defaults,
          maximum_center_distance: 12,
          minimum_jaccard: 0.1,
          minimum_mapping_coverage: 0.5,
          minimum_shared_residues: 1,
        }
      : { ...defaults };
}
