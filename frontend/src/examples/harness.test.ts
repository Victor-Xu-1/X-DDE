import { describe, expect, it } from "vitest";
import { exampleHarnessInputs, exampleHarnessPayload } from "./harness";
import type { PreparedExample } from "./types";
import type { ScientificObject } from "../research/types";

const heavy = "EVQLVESGG";
const light = "DIQMTQSPSS";
function object(id: string): ScientificObject {
  return {
    id,
    family_id: id,
    kind: "structure",
    label: "Protocol fixture",
    reference: {
      asset_id: id,
      sha256: "a".repeat(64),
      record: 0,
      conformer: 0,
      version_id: id,
    },
    parent_id: null,
    relation: "derived_from",
    notes: "Protocol fixture, not a published research case",
    rating: 0,
    source_job: null,
    created_at: "2026-10-02",
    validation: "file_integrity_only",
  };
}
const structure = object("00000000-0000-4000-8000-000000000001");
const unused = object("00000000-0000-4000-8000-000000000002");
const fasta = {
  ...object("00000000-0000-4000-8000-000000000003"),
  kind: "sequence" as const,
};
const example: PreparedExample = {
  module: {
    capability_id: "epitope",
    case_id: "trastuzumab-her2",
    revision: 1,
  },
  case: {
    id: "trastuzumab-her2",
    revision: 1,
    label: ["Protocol fixture", "Protocol fixture"],
    description: ["", ""],
    sources: [],
  },
  objects: { her2: structure, her2_pertuzumab: unused, antibody_chains: fasta },
  sequences: { heavy, light },
  sequence_sources: { antibody_chains: [heavy, light] },
  sources: [],
};
describe("native example input provenance", () => {
  it("uses a real asset token and does not attach unused experimental structures", () => {
    const payload = exampleHarnessPayload(
      "epitope",
      { cdr_regions: {} },
      example,
    );
    expect(payload.structure_path).toBe(
      `asset:${structure.reference.asset_id}`,
    );
    expect(exampleHarnessInputs("epitope", payload, example)).toEqual([
      structure.reference,
    ]);
  });
  it("attaches matching multichain FASTA provenance and drops it after editing", () => {
    expect(
      exampleHarnessInputs("esm", { sequences: [heavy, light] }, example),
    ).toEqual([fasta.reference]);
    expect(
      exampleHarnessInputs("esm", { sequences: [heavy + "A", light] }, example),
    ).toEqual([]);
  });
  it("loads the immutable native request without changing its source record", () => {
    const request = {
      operation: "harness" as const,
      tool: "esm2",
      name: "Protocol",
      payload: {
        parent_chains: { B: heavy },
        mutable_positions: { B: [2] },
        num_sequences: 4,
      },
      allow_external: false,
    };
    const loaded = exampleHarnessPayload("esm2", {}, { ...example, request });
    expect(loaded).toEqual(request.payload);
    (loaded.mutable_positions as Record<string, number[]>).B.push(3);
    expect(request.payload.mutable_positions.B).toEqual([2]);
  });
});
