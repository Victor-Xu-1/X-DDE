import type { Job } from "../types";
import type { MoleculeRef } from "../research/types";
import type { OperationResult } from "../operations/types";
import type { Site } from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function molecule(value: unknown): value is MoleculeRef {
  return (
    isObject(value) &&
    typeof value.asset_id === "string" &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.sha256) &&
    Number.isSafeInteger(value.record) &&
    Number(value.record) >= 0 &&
    Number.isSafeInteger(value.conformer) &&
    Number(value.conformer) >= 0
  );
}

export function sameStructure(left: unknown, right: unknown): boolean {
  return (
    molecule(left) &&
    molecule(right) &&
    left.sha256 === right.sha256 &&
    left.record === right.record &&
    left.conformer === right.conformer
  );
}

/** Only a completed, ligand-defined inspection on identical receptor bytes is comparable. */
export function isReferenceJob(job: Job, protein: MoleculeRef): boolean {
  if (job.status !== "succeeded" || job.request.operation !== "diffsbdd")
    return false;
  const payload = job.request.payload;
  return (
    payload.mode === "pocket" &&
    sameStructure(payload.protein, protein) &&
    isObject(payload.pocket) &&
    payload.pocket.kind === "ligand" &&
    molecule(payload.pocket.ligand)
  );
}

export interface ReferenceComparison {
  referenceArtifact: string;
  ligand: MoleculeRef;
  referenceCount: number;
  overlap: string[];
}

/** Reject ambiguous residue identities and mismatched source records instead of guessing. */
export function compareReference(
  protein: MoleculeRef,
  site: Site,
  job: Job,
  result: OperationResult,
): ReferenceComparison | null {
  if (
    job.request.operation !== "diffsbdd" ||
    !isReferenceJob(job, protein) ||
    result.operation !== "diffsbdd" ||
    result.mode !== "pocket" ||
    result.complete !== true ||
    typeof result.reference_artifact !== "string" ||
    !result.reference_artifact ||
    !isObject(result.ligand_status) ||
    result.ligand_status.state !== "verified" ||
    !isObject(result.provenance) ||
    !isObject(result.provenance.inputs) ||
    !sameStructure(result.provenance.inputs.protein, protein) ||
    !isObject(result.provenance.inputs.pocket) ||
    !isObject(job.request.payload.pocket) ||
    !sameStructure(
      result.provenance.inputs.pocket.ligand,
      job.request.payload.pocket.ligand,
    ) ||
    !Array.isArray(result.residues) ||
    !result.residues.length ||
    result.residues.length > 2000 ||
    !site.residues.length
  )
    return null;
  const reference = new Set<string>();
  for (const item of result.residues) {
    if (typeof item !== "string" || !/^[A-Za-z0-9]:-?\d+$/.test(item))
      return null;
    reference.add(item);
  }
  const selected = new Set<string>();
  for (const residue of site.residues) {
    if (
      !sameStructure(residue.structure, protein) ||
      residue.model !== 0 ||
      !/^[A-Za-z0-9]$/.test(residue.chain) ||
      !Number.isSafeInteger(residue.number) ||
      residue.insertion_code ||
      residue.alternate_location
    )
      return null;
    selected.add(`${residue.chain}:${residue.number}`);
  }
  return {
    referenceArtifact: result.reference_artifact,
    ligand: (job.request.payload.pocket as { ligand: MoleculeRef }).ligand,
    referenceCount: reference.size,
    overlap: [...selected].filter((value) => reference.has(value)),
  };
}
