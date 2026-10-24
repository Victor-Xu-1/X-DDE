import { expect, it } from "vitest";
import type { Job } from "../types";
import { foldAssessment } from "./fold-assessment";

const job = (options: Record<string, unknown> = {}): Job => ({
  id: "fold",
  status: "succeeded",
  created_at: "2026-10-24T00:00:00Z",
  started_at: null,
  finished_at: null,
  error: null,
  parent_id: null,
  request: {
    operation: "harness",
    tool: "fold",
    name: "Fold control",
    allow_external: true,
    payload: { options },
  },
});
const candidate = () => ({
  metrics: {
    iptm: 0.6966227889060974,
    gate_passed: 0,
    cdr_contact_fraction: 0,
    framework_contact_fraction: 1,
  },
  metadata: {
    chains: { A: "EVQLVESGG", B: "DIVMTQSP" },
    gate_passed: false,
    gate_evidence: {
      binder_interface_residues: 32,
      cdr_contact_fraction: 0,
      framework_contact_fraction: 1,
      cdr_position_semantics: "zero_based_sequence_order",
      epitope_gate_skipped: true,
      epitope_gate_skip_reason: "no_hotspots_configured",
    },
  },
});
const annotatedOptions = () => ({
  binder_chain_ids: ["A", "B"],
  cdr_regions: { A: [0, 1], B: [1, 2] },
});

it("keeps a completed high-confidence native failure and does not interpret missing annotations as zero CDR contacts", () => {
  const value = candidate(),
    request = job({ binder_chain_ids: ["A", "B"] });
  const original = JSON.stringify({ value, request });
  const assessment = foldAssessment(request, value);
  expect(assessment).toMatchObject({
    gate: "failed",
    cdrRelevant: true,
    annotated: false,
    fractions: null,
    epitopeSkipped: true,
    noHotspots: true,
  });
  expect(JSON.stringify({ value, request })).toBe(original);
});
it("retains a measured zero when both chains have complete annotations and native interface contacts", () => {
  expect(foldAssessment(job(annotatedOptions()), candidate())).toMatchObject({
    annotated: true,
    fractions: { cdr: 0, framework: 1 },
    gate: "failed",
  });
});
it.each([
  { binder_chain_ids: ["A", "B"], cdr_regions: { A: [1] } },
  { binder_chain_ids: ["A", "B"], cdr_regions: { A: [1], B: [] } },
  { binder_chain_ids: ["A", "A"], cdr_regions: { A: [1] } },
  { binder_chain_ids: ["A", "Z"], cdr_regions: { A: [1], Z: [1] } },
  { binder_chain_ids: ["A", "B"], cdr_regions: { A: [1, 1], B: [1] } },
  { binder_chain_ids: ["A", "B"], cdr_regions: { A: [-1], B: [1] } },
  { binder_chain_ids: ["A", "B"], cdr_regions: { A: [9], B: [1] } },
  { binder_chain_ids: ["A", "B"], cdr_regions: { A: [1.5], B: [1] } },
  { binder_chain_ids: ["A", "B"], cdr_regions: { A: ["1"], B: [1] } },
  { cdr_regions: { A: [1], B: [1] } },
])(
  "requires unambiguous in-range annotations for every declared binder chain: %j",
  (options) => {
    expect(foldAssessment(job(options), candidate()).fractions).toBeNull();
  },
);
it.each([
  { metadata: { gate_passed: true }, metrics: { gate_passed: 0 } },
  { metadata: { gate_passed: "false" }, metrics: { gate_passed: 0 } },
  { metadata: { gate_passed: false }, metrics: { gate_passed: null } },
  { metadata: {}, metrics: { gate_passed: 0.5 } },
])("refuses conflicting or malformed native flags: %j", (value) => {
  expect(foldAssessment(job(), value).gate).toBe("inconsistent");
});
it("does not infer quality from confidence or job completion when no flag is reported", () => {
  expect(
    foldAssessment(
      { ...job(), status: "succeeded" },
      { metrics: { iptm: 0.99 } },
    ).gate,
  ).toBe("missing");
});
it.each([
  { metadata: { gate_passed: true }, metrics: {} },
  { metadata: {}, metrics: { gate_passed: 1 } },
  { metadata: { gate_passed: true }, metrics: { gate_passed: 1 } },
])("preserves an explicit valid native pass: %j", (value) => {
  expect(foldAssessment(job(), value).gate).toBe("passed");
});
it("does not report fractions for no-contact, unknown-position or inconsistent measurement records", () => {
  for (const change of [
    { binder_interface_residues: 0 },
    { cdr_position_semantics: "author_residue_number" },
    { cdr_contact_fraction: 0.8 },
    { framework_contact_fraction: Number.NaN },
  ]) {
    const value = candidate();
    Object.assign(value.metadata.gate_evidence, change);
    expect(foldAssessment(job(annotatedOptions()), value).fractions).toBeNull();
  }
});
it("does not turn native epitope absence into an observed failure or a successful test", () => {
  const value = candidate();
  expect(foldAssessment(job(), value).epitopeSkipped).toBe(true);
  delete (
    value.metadata.gate_evidence as Partial<typeof value.metadata.gate_evidence>
  ).epitope_gate_skipped;
  expect(foldAssessment(job(), value).epitopeSkipped).toBe(false);
});
