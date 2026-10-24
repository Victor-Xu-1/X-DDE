import type { Job } from "../types";
import { candidateChains, record } from "./candidate-sequence-model";

type NativeGate = "passed" | "failed" | "missing" | "inconsistent";

function nativeGate(candidate: Record<string, unknown>): NativeGate {
  const metadata = record(candidate.metadata),
    metrics = record(candidate.metrics);
  const flags: boolean[] = [];
  if (Object.hasOwn(metadata, "gate_passed")) {
    if (typeof metadata.gate_passed !== "boolean") return "inconsistent";
    flags.push(metadata.gate_passed);
  }
  if (Object.hasOwn(metrics, "gate_passed")) {
    if (metrics.gate_passed !== 0 && metrics.gate_passed !== 1)
      return "inconsistent";
    flags.push(metrics.gate_passed === 1);
  }
  if (!flags.length) return "missing";
  if (flags.some((flag) => flag !== flags[0])) return "inconsistent";
  return flags[0] ? "passed" : "failed";
}

function completeCdrPositions(
  options: Record<string, unknown>,
  candidate: Record<string, unknown>,
) {
  const ids = options.binder_chain_ids,
    regions = record(options.cdr_regions);
  const chains = new Map(
    candidateChains(candidate).map(({ chain, sequence }) => [chain, sequence]),
  );
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    new Set(ids).size === ids.length &&
    ids.every((id) => {
      if (typeof id !== "string" || !id.trim()) return false;
      const sequence = chains.get(id),
        positions = regions[id];
      return (
        typeof sequence === "string" &&
        /^[A-Z]+$/.test(sequence) &&
        Array.isArray(positions) &&
        positions.length > 0 &&
        new Set(positions).size === positions.length &&
        positions.every(
          (position) =>
            Number.isInteger(position) &&
            position >= 0 &&
            position < sequence.length,
        )
      );
    })
  );
}

function fraction(
  metrics: Record<string, unknown>,
  evidence: Record<string, unknown>,
  key: string,
) {
  const values = [metrics, evidence]
    .filter((source) => Object.hasOwn(source, key))
    .map((source) => source[key]);
  if (
    !values.length ||
    values.some(
      (value) =>
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1,
    )
  )
    return null;
  const first = values[0] as number;
  return values.every((value) => Math.abs((value as number) - first) < 1e-6)
    ? first
    : null;
}

/** Interpret the frozen native result; never recompute its gate or infer one from confidence. */
export function foldAssessment(job: Job, candidate: Record<string, unknown>) {
  const payload =
    job.request.operation === "harness" ? record(job.request.payload) : {};
  const options = record(payload.options),
    metrics = record(candidate.metrics);
  const evidence = record(record(candidate.metadata).gate_evidence);
  const cdrRelevant =
    Object.hasOwn(options, "cdr_regions") ||
    [metrics, evidence].some(
      (source) =>
        Object.hasOwn(source, "cdr_contact_fraction") ||
        Object.hasOwn(source, "framework_contact_fraction"),
    );
  const annotated =
    completeCdrPositions(options, candidate) &&
    evidence.cdr_position_semantics === "zero_based_sequence_order";
  const contactCount = evidence.binder_interface_residues;
  const hasContacts =
    typeof contactCount === "number" &&
    Number.isInteger(contactCount) &&
    contactCount > 0;
  const cdr = fraction(metrics, evidence, "cdr_contact_fraction"),
    framework = fraction(metrics, evidence, "framework_contact_fraction");
  const fractions =
    annotated &&
    hasContacts &&
    cdr !== null &&
    framework !== null &&
    Math.abs(cdr + framework - 1) < 1e-6
      ? { cdr, framework }
      : null;
  return {
    gate: nativeGate(candidate),
    cdrRelevant,
    annotated,
    fractions,
    epitopeSkipped: evidence.epitope_gate_skipped === true,
    noHotspots: evidence.epitope_gate_skip_reason === "no_hotspots_configured",
  };
}
