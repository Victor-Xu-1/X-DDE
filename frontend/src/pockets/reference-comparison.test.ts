import { describe, expect, it } from "vitest";
import type { Job } from "../types";
import type { OperationResult } from "../operations/types";
import type { MoleculeRef } from "../research/types";
import type { Site } from "./types";
import { compareReference, isReferenceJob } from "./reference-comparison";

const protein: MoleculeRef = {
  asset_id: "protein",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const ligand: MoleculeRef = {
  asset_id: "ligand",
  sha256: "b".repeat(64),
  record: 0,
  conformer: 0,
};
const pocket = { kind: "ligand", ligand };
const job = {
  id: "reference-job",
  status: "succeeded",
  created_at: "2026-01-01T00:00:00Z",
  started_at: null,
  finished_at: null,
  error: null,
  parent_id: null,
  request: {
    name: "Reference",
    operation: "diffsbdd",
    payload: { mode: "pocket", protein, pocket },
  },
} as Job;
const result: OperationResult = {
  operation: "diffsbdd",
  mode: "pocket",
  complete: true,
  reference_artifact: "reference.sdf",
  ligand_status: { state: "verified" },
  provenance: { inputs: { protein, pocket } },
  residues: ["A:542", "A:544", "A:544"],
};
const site = {
  rank: 3,
  name: "pocket3",
  score: 1,
  probability: 0.1,
  center_x: 0,
  center_y: 0,
  center_z: 0,
  residues: [542, 202].map((number) => ({
    structure: protein,
    model: 0,
    chain: "A",
    number,
    insertion_code: "",
    alternate_location: "",
  })),
} as Site;

describe("reference pocket comparison", () => {
  it("compares distinct native residue identities and preserves the exact ligand", () => {
    expect(compareReference(protein, site, job, result)).toEqual({
      referenceArtifact: "reference.sdf",
      ligand,
      referenceCount: 2,
      overlap: ["A:542"],
    });
    expect(
      compareReference(
        protein,
        { ...site, residues: [site.residues[1]] },
        job,
        result,
      )?.overlap,
    ).toEqual([]);
  });
  it("rejects a different receptor, structural record or unfinished task", () => {
    expect(isReferenceJob(job, { ...protein, sha256: "c".repeat(64) })).toBe(
      false,
    );
    expect(isReferenceJob(job, { ...protein, record: 1 })).toBe(false);
    expect(isReferenceJob({ ...job, status: "running" }, protein)).toBe(false);
    expect(
      compareReference(protein, site, job, {
        ...result,
        provenance: {
          inputs: { protein: { ...protein, sha256: "c".repeat(64) }, pocket },
        },
      }),
    ).toBeNull();
    expect(
      compareReference(protein, site, job, {
        ...result,
        provenance: {
          inputs: {
            protein,
            pocket: {
              kind: "ligand",
              ligand: { ...ligand, sha256: "d".repeat(64) },
            },
          },
        },
      }),
    ).toBeNull();
  });
  it("does not guess missing results or ambiguous residue addresses", () => {
    expect(
      compareReference(protein, site, job, { ...result, residues: ["A:542B"] }),
    ).toBeNull();
    expect(
      compareReference(
        protein,
        { ...site, residues: [{ ...site.residues[0], insertion_code: "A" }] },
        job,
        result,
      ),
    ).toBeNull();
    expect(
      compareReference(protein, site, job, {
        ...result,
        ligand_status: { state: "unverified" },
      }),
    ).toBeNull();
    expect(
      compareReference(protein, site, job, { ...result, residues: [] }),
    ).toBeNull();
  });
});
