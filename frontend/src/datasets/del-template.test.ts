import { expect, it } from "vitest";
import {
  defaultDELExecution,
  executionForDEL,
  retainedDELParameters,
  validDELExecution,
} from "./del-template";
import type { DatasetTask } from "./types";

const template: DatasetTask = {
  operation: "del_followup",
  name: "Protocol fixture only",
  inputs: [
    {
      role: "counts",
      label: "original.csv",
      source: {
        asset_id: "original",
        sha256: "a".repeat(64),
        record: 0,
        conformer: 0,
      },
    },
  ],
  sources: [
    {
      role: "analysis",
      job_id: "reviewed-parent",
      report_sha256: "b".repeat(64),
    },
  ],
  payload: {
    kind: "deli",
    mode: "followup",
    library_size: 884736,
    followup_source: "https://example.org/reported-study",
    followup_relation_column: "relation",
  },
  options: { device: "cpu", cpu: 2, memory_mib: 2048, seed: 2026 },
  time_limit_seconds: 1800,
  output_bytes: 1024 ** 3,
};
it("retains source-bound scientific fields despite harmless file-label normalization", () => {
  const values = template.inputs.map((item) => ({ ...item, label: "" }));
  expect(
    retainedDELParameters(template, "del_followup", values, template.sources),
  ).toEqual(template.payload);
  expect(executionForDEL(template)).toEqual({
    options: template.options,
    time_limit_seconds: 1800,
    output_bytes: 1024 ** 3,
  });
  expect(defaultDELExecution().options.seed).toBe(101);
  expect(template.options.seed).toBe(2026);
});
it("does not carry annotations across changed material, native parent or operation", () => {
  const other = template.inputs.map((item) => ({
    ...item,
    source: { ...item.source, sha256: "c".repeat(64) },
  }));
  expect(
    retainedDELParameters(template, "del_followup", other, template.sources),
  ).toEqual({});
  expect(
    retainedDELParameters(template, "del_followup", template.inputs, [
      { ...template.sources[0], report_sha256: "c".repeat(64) },
    ]),
  ).toEqual({});
  expect(
    retainedDELParameters(
      template,
      "del_analyze",
      template.inputs,
      template.sources,
    ),
  ).toEqual({});
});
it("keeps read lane labels significant and enforces the backend resource bounds", () => {
  const reads = {
    ...template,
    inputs: template.inputs.map((value) => ({
      ...value,
      role: "reads" as const,
    })),
  };
  expect(
    retainedDELParameters(
      reads,
      reads.operation,
      [{ ...reads.inputs[0], label: "changed-lane" }],
      reads.sources,
    ),
  ).toEqual({});
  expect(validDELExecution(executionForDEL(template))).toBe(true);
  expect(
    validDELExecution({
      ...executionForDEL(template),
      options: { ...template.options, cpu: 17 },
    }),
  ).toBe(false);
  expect(
    validDELExecution({
      ...executionForDEL(template),
      options: { ...template.options, memory_mib: 65537 },
    }),
  ).toBe(false);
});
