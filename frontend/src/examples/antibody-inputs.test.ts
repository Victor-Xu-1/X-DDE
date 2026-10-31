import { describe, expect, it } from "vitest";
import { exampleHarnessInputs } from "./harness";
import type { PreparedExample } from "./types";
import type { HarnessTask } from "../operations/types";

const reference = {
  asset_id: "00000000-0000-4000-8000-000000000001",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
  version_id: "00000000-0000-4000-8000-000000000002",
};
const heavy = "EVQLVESGG";
const light = "DIQMTQSPSS";
const groups = {
  A: { CDR1: [2], CDR2: [4], CDR3: [6] },
  B: { CDR1: [1], CDR2: [3], CDR3: [5] },
};
function fixture(tool: string): PreparedExample & { request: HarnessTask } {
  const payload =
    tool === "fold"
      ? {
          candidates: [
            { candidate_id: "control", chains: { A: heavy, B: light } },
          ],
          options: {
            binder_chain_ids: ["A", "B"],
            cdr_regions: { A: [2, 4, 6], B: [1, 3, 5] },
            cdr3_positions: { A: [6], B: [5] },
          },
        }
      : {
          structure_path: `asset:${reference.asset_id}`,
          antibody_chains: ["A", "B"],
          antigen_chains: ["C"],
          cdr_regions: groups,
          cutoff: 4.5,
        };
  return {
    objects: {
      antibody_cdr_inputs: {
        kind: tool === "fold" ? "sequence" : "structure",
        reference,
      },
    },
    sequences: {},
    request: {
      operation: "harness",
      name: "Protocol fixture",
      tool,
      payload,
      scientific_inputs: [reference],
    },
  } as unknown as PreparedExample & { request: HarnessTask };
}

describe("native-numbered interface input provenance", () => {
  it.each(["fold", "epitope"])(
    "keeps exact %s annotations across compute settings and key order changes",
    (tool) => {
      const example = fixture(tool);
      const payload = structuredClone(example.request!.payload);
      if (tool === "fold") {
        const options = payload.options as Record<string, unknown>;
        options.seeds = [20261031];
        options.cdr3_positions = { B: [5], A: [6] };
        (payload.candidates as { candidate_id: string }[])[0].candidate_id =
          "my-run";
      } else payload.cutoff = 5;
      expect(exampleHarnessInputs(tool, payload, example)).toEqual([reference]);
    },
  );
  it.each(["fold", "epitope"])(
    "detaches edited %s CDRs while retaining the original annotation",
    (tool) => {
      const example = fixture(tool);
      const original = structuredClone(example.request!.payload);
      const payload = structuredClone(original);
      const owner =
        tool === "fold"
          ? (payload.options as Record<string, unknown>)
          : payload;
      owner.cdr_regions = {};
      expect(exampleHarnessInputs(tool, payload, example)).toEqual([]);
      expect(example.request!.payload).toEqual(original);
    },
  );
  it("detaches a changed binder sequence, chain mapping or added candidate", () => {
    const example = fixture("fold");
    for (const edit of [
      (payload: Record<string, unknown>) => {
        (
          payload.candidates as { chains: Record<string, string> }[]
        )[0].chains.A += "A";
      },
      (payload: Record<string, unknown>) => {
        (payload.options as Record<string, unknown>).binder_chain_ids = ["B"];
      },
      (payload: Record<string, unknown>) => {
        (payload.candidates as unknown[]).push({ chains: { A: heavy } });
      },
      (payload: Record<string, unknown>) => {
        (payload.options as Record<string, unknown>).cdr3_positions = {};
      },
    ]) {
      const payload = structuredClone(example.request!.payload);
      edit(payload);
      expect(exampleHarnessInputs("fold", payload, example)).toEqual([]);
    }
  });
  it("detaches an epitope annotation after coordinate file or chain selection changes", () => {
    const example = fixture("epitope");
    for (const replacement of [
      { structure_path: "asset:00000000-0000-4000-8000-000000000004" },
      { antibody_chains: ["B"] },
      { antigen_chains: ["D"] },
    ])
      expect(
        exampleHarnessInputs(
          "epitope",
          { ...example.request!.payload, ...replacement },
          example,
        ),
      ).toEqual([]);
  });
  it("does not attach an unreferenced object, another tool's source or a cold template", () => {
    const example = fixture("fold");
    const payload = example.request!.payload;
    expect(exampleHarnessInputs("esm", { sequences: [] }, example)).toEqual([]);
    example.request!.scientific_inputs = [];
    expect(exampleHarnessInputs("fold", payload, example)).toEqual([]);
    expect(
      exampleHarnessInputs("fold", payload, { ...example, request: null }),
    ).toEqual([]);
  });
});
