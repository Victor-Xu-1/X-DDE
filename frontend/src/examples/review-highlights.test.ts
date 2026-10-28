import { describe, expect, it } from "vitest";
import type { ExampleInfo } from "./types";
import { reviewedHighlight } from "./review-highlights";

const base: ExampleInfo = {
  module: {
    capability_id: "p2rank.detect",
    case_id: "stat6-defined-molecules",
    revision: 3,
  },
  case: {
    id: "stat6-defined-molecules",
    revision: 2,
    label: ["STAT6", "STAT6"],
    description: ["案例", "Example"],
    sources: [],
  },
  files: [],
  computed_result_available: true,
  pin: {
    job_id: "256b08a8-b466-47c4-a69e-32ad1d3bc9d9",
    artifact_sha256: {
      "result.json":
        "6d1683d952f64163c752a6d5d729e7179df86e66b82a8d5b1a6b0d61c3fa8362",
    },
    review: {
      scope: "reviewed_computational_example",
      interpretation: "Evidence reviewed",
      limitations: "No recovered reference pocket",
      checked: [],
    },
  },
};

describe("review highlights are tied to exact retained evidence", () => {
  it("summarizes the observed pocket comparison in both languages", () => {
    expect(reviewedHighlight(base, "zh")).toContain("17 个接触残基");
    expect(reviewedHighlight(base, "en")).toContain("17 residues");
  });

  it.each([
    [
      "gnina.dock",
      4,
      "5d2c6867-0563-488a-bda0-9f063458f0d8",
      "6e76b62358ee81d48caf78b155d10a3e720994b0ebf9002d9db5dcb06a2da38f",
      "analogue",
    ],
    [
      "diffsbdd.generate",
      3,
      "be6389cf-e6ce-4d2e-ae5a-9786d62dfe8a",
      "87c304e38e2eafa8de112a5cc3e201572e1836ab91e2cd7d0338403ced59facc",
      "geometry issues",
    ],
  ] as const)(
    "keeps %s limitations tied to its exact output",
    (capability, revision, job, sha, text) => {
      const info: ExampleInfo = {
        ...base,
        module: { ...base.module, capability_id: capability, revision },
        pin: {
          ...base.pin!,
          job_id: job,
          artifact_sha256: { "result.json": sha },
        },
      };
      expect(reviewedHighlight(info, "en")).toContain(text);
    },
  );

  it("does not reuse conclusions for changed evidence, job, revision or case", () => {
    expect(reviewedHighlight(null, "en")).toBeNull();
    expect(reviewedHighlight({ ...base, pin: null }, "en")).toBeNull();
    expect(
      reviewedHighlight(
        {
          ...base,
          pin: { ...base.pin!, artifact_sha256: undefined },
        } as unknown as ExampleInfo,
        "en",
      ),
    ).toBeNull();
    expect(
      reviewedHighlight(
        { ...base, module: { ...base.module, revision: 4 } },
        "en",
      ),
    ).toBeNull();
    expect(
      reviewedHighlight({ ...base, case: { ...base.case, id: "other" } }, "en"),
    ).toBeNull();
    expect(
      reviewedHighlight(
        { ...base, pin: { ...base.pin!, job_id: "other" } },
        "en",
      ),
    ).toBeNull();
    expect(
      reviewedHighlight(
        {
          ...base,
          pin: {
            ...base.pin!,
            artifact_sha256: { "result.json": "a".repeat(64) },
          },
        },
        "en",
      ),
    ).toBeNull();
  });

  it("shows the reviewed pose-quality scope only with both exact follow-up reports", () => {
    const evidence = [
      {
        job_id: "8969b071-879b-4374-9044-f9108ba29588",
        artifact_sha256: {
          "result.json": "b2ddd68b1d5c298a1850080ac41bfc5a7a94202b294dc41600e85c5e665521df",
        },
      },
      {
        job_id: "ca498efb-cb18-40ca-9262-c2597ab422da",
        artifact_sha256: {
          "result.json": "639c5abca478299a191aa45a0b21880ec1d3c083cb41aca2caadeed22b306e8d",
        },
      },
    ];
    const info: ExampleInfo = {
      ...base,
      module: { ...base.module, capability_id: "gnina.dock", revision: 5 },
      pin: {
        ...base.pin!,
        job_id: "cf623a70-e687-47d1-9727-4433dc6429b5",
        artifact_sha256: {
          "result.json": "a0cd9fe2e3405f1aea4094fd3e683bb91c3c032b355e334fce56049c3fa8362",
        },
        supporting_evidence: evidence,
      },
    };
    expect(reviewedHighlight(info, "zh")).toContain("姿势 3 和 9");
    expect(reviewedHighlight(info, "en")).toContain("default pose 1");
    expect(reviewedHighlight({
      ...info, pin: { ...info.pin!, supporting_evidence: [evidence[0]] },
    }, "en")).toBeNull();
    expect(reviewedHighlight({
      ...info, pin: { ...info.pin!, supporting_evidence: [
        evidence[0], { ...evidence[1], artifact_sha256: { "result.json": "0".repeat(64) } },
      ] },
    }, "en")).toBeNull();
  });
});
