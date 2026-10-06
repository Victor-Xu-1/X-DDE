import { describe, expect, it } from "vitest";
import { screeningPlan, taskFor } from "./dataset-model";
import { validReadLanes, type ReadLane } from "./DELReadFiles";

const receptor = {
  asset_id: "10000000-0000-4000-8000-000000000001",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const ligand = {
  ...receptor,
  asset_id: "10000000-0000-4000-8000-000000000002",
  sha256: "b".repeat(64),
};
const inputs = [
  { role: "structure" as const, source: receptor },
  { role: "ligand" as const, source: ligand },
];
const pocket = {
  kind: "reference_ligand" as const,
  frame: receptor,
  reference: ligand,
  coordinate_basis: "user_confirmed" as const,
};

describe("screening plans", () => {
  it("sends strict native source references while retaining UI metadata only in the picker", () => {
    const source = {
      job_id: receptor.asset_id,
      report_sha256: "d".repeat(64),
      role: "analysis" as const,
      name: "Public BRD4 study",
      counts: { observed_members: 3000 },
      metadata: { chosen_comparison: "BRD4" },
    };
    const task = taskFor(
      "del.series",
      { kind: "deli", mode: "series", chosen_comparison: "BRD4" },
      [],
      [source],
      "BRD4 series",
    );
    expect(task.sources).toEqual([
      {
        job_id: source.job_id,
        report_sha256: source.report_sha256,
        role: "analysis",
      },
    ]);
    expect(source.metadata.chosen_comparison).toBe("BRD4");
  });
  it("uses the selected fresh library and exact receptor frame through one planned chain", () => {
    const plan = screeningPlan({
      name: "BRD4",
      library: {
        id: "10000000-0000-4000-8000-000000000003",
        sha256: "c".repeat(64),
        name: "supplier.sdf",
        suffix: ".sdf",
        kind: "library",
        bytes: 500,
      } as never,
      supplier: "chemdiv",
      existingIndexes: [],
      receptorInputs: inputs,
      pocket,
      topK: 300,
      retain: 40,
      dock: true,
      device: "cpu",
    });
    expect(plan.steps.map((step) => step.request.operation)).toEqual([
      "library_prepare",
      "drugclip_index",
      "drugclip_retrieve",
      "screening_dock",
    ]);
    expect(plan.steps[1].data_bindings).toEqual([
      { from_step: "library", slot: 0, role: "library" },
    ]);
    expect(plan.steps[3].data_bindings?.[0].select_candidates).toBe(true);
    expect(plan.steps[2].request).toMatchObject({
      inputs,
      payload: {
        receptor,
        search: pocket,
        top_k: 300,
        retain: 40,
        use: "non_commercial",
      },
    });
    expect(plan.budget.max_jobs).toBe(4);
  });
  it("does not prepare or re-encode a deliberately selected historical index", () => {
    const source = {
      job_id: "10000000-0000-4000-8000-000000000004",
      report_sha256: "d".repeat(64),
      role: "index" as const,
    };
    const plan = screeningPlan({
      name: "BRD4",
      library: null,
      supplier: "custom",
      existingIndexes: [source],
      receptorInputs: inputs,
      pocket,
      topK: 100,
      retain: 25,
      dock: false,
      device: "cpu",
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].request).toMatchObject({ sources: [source] });
    expect(plan.steps[0].data_bindings).toBeUndefined();
  });
});

describe("DEL read assignments", () => {
  const lane: ReadLane = {
    id: "lane1",
    file: { id: "read1" } as never,
    mate: null,
    paired: false,
    encodedMate: "r1",
    assignments: [{ sample: "BRD4_1", barcode: "" }],
  };
  it("requires the actual mate file and unambiguous multiplexed prefixes", () => {
    expect(validReadLanes([lane], true)).toBe(true);
    expect(validReadLanes([{ ...lane, paired: true }], true)).toBe(false);
    expect(
      validReadLanes(
        [
          {
            ...lane,
            assignments: [
              { sample: "a", barcode: "ACGT" },
              { sample: "b", barcode: "ACGTAA" },
            ],
          },
        ],
        true,
      ),
    ).toBe(false);
    expect(
      validReadLanes(
        [
          {
            ...lane,
            assignments: [
              { sample: "a", barcode: "ACGT" },
              { sample: "b", barcode: "TCAA" },
            ],
          },
        ],
        true,
      ),
    ).toBe(true);
  });
  it("does not silently rename samples or accept invalid bases", () => {
    expect(
      validReadLanes(
        [{ ...lane, assignments: [{ sample: "", barcode: "" }] }],
        true,
      ),
    ).toBe(false);
    expect(
      validReadLanes(
        [{ ...lane, assignments: [{ sample: "a", barcode: "ACGN" }] }],
        true,
      ),
    ).toBe(false);
  });
});
