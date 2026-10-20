import { useEffect, useState } from "react";
import { request } from "../api";
import type { DatasetCandidate, DatasetResult } from "./types";

interface Evidence {
  selection: number;
  reference: number;
  score: number;
  lower: number;
  upper: number;
  replicate_cv: number | null;
  supporting_samples?: number;
  target_samples?: number;
  countUnit: unknown;
  comparisonLabel: string;
}
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const count = (value: unknown): value is number =>
  finite(value) && Number.isSafeInteger(value) && value >= 0;

/** Read the exact encoded member from its recorded analysis; never borrow a nearby hit. */
export function useDELCandidateEvidence(
  jobId: string,
  candidate: DatasetCandidate,
  result: DatasetResult,
) {
  const source = result.metadata.source;
  const sourceId =
    object(source) && typeof source.job_id === "string" ? source.job_id : "";
  const digest =
    object(source) && typeof source.report_sha256 === "string"
      ? source.report_sha256
      : "";
  const comparison =
    typeof result.metadata.chosen_comparison === "string"
      ? result.metadata.chosen_comparison
      : "";
  const validSource =
    object(source) &&
    source.role === "analysis" &&
    /^[a-f0-9-]{36}$/.test(sourceId) &&
    /^[a-f0-9]{64}$/.test(digest) &&
    /^[A-Za-z0-9_-]{1,64}$/.test(comparison) &&
    candidate.source_job === sourceId;
  const key = JSON.stringify([
    jobId,
    candidate.id,
    candidate.score,
    sourceId,
    digest,
    comparison,
    validSource,
  ]);
  const [state, setState] = useState<{
    key: string;
    value?: Evidence;
    failed?: boolean;
  } | null>(null);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(30000),
    ]);
    setState(null);
    if (!validSource) {
      setState({ key, failed: true });
      return;
    }
    void (async () => {
      const summary = await request<Record<string, unknown>>(
        `/datasets/${sourceId}/summary`,
        { signal },
      );
      if (
        summary.job_id !== sourceId ||
        summary.report_sha256 !== digest ||
        summary.role !== "analysis" ||
        summary.operation !== "del_analyze" ||
        !object(summary.metadata)
      )
        throw new Error("Unverified source report");
      const params = new URLSearchParams({
        view: "enrichment",
        comparison,
        search: candidate.id,
        limit: "100",
      });
      const page = await request<{ rows: unknown[] }>(
        `/datasets/${sourceId}/table?${params}`,
        { signal },
      );
      const matching = Array.isArray(page.rows)
        ? page.rows.filter(
            (row) =>
              object(row) &&
              row.member === candidate.id &&
              row.comparison === comparison,
          )
        : [];
      const row = matching.length === 1 ? matching[0] : null;
      if (
        !object(row) ||
        !count(row.selection) ||
        !count(row.reference) ||
        !finite(row.score) ||
        row.score < 0 ||
        !finite(row.lower) ||
        !finite(row.upper) ||
        row.lower < 0 ||
        row.upper < row.lower ||
        !(
          row.replicate_cv === null ||
          (finite(row.replicate_cv) && row.replicate_cv >= 0)
        )
      )
        throw new Error("Invalid native count evidence");
      if (
        candidate.score != null &&
        (!finite(candidate.score) ||
          Math.abs(candidate.score - row.score) >
            1e-8 * Math.max(1, Math.abs(row.score)))
      )
        throw new Error("Candidate score differs from its source");
      const support =
        row.supporting_samples === undefined && row.target_samples === undefined
          ? {}
          : count(row.supporting_samples) &&
              count(row.target_samples) &&
              row.target_samples > 0 &&
              row.supporting_samples <= row.target_samples
            ? {
                supporting_samples: row.supporting_samples,
                target_samples: row.target_samples,
              }
            : null;
      if (!support) throw new Error("Invalid sample support");
      const value: Evidence = {
        selection: row.selection,
        reference: row.reference,
        score: row.score,
        lower: row.lower,
        upper: row.upper,
        replicate_cv: row.replicate_cv,
        ...support,
        countUnit: summary.metadata.count_unit,
        comparisonLabel: comparison,
      };
      const comparisons = summary.metadata.comparisons;
      const chosen = Array.isArray(comparisons)
        ? comparisons.find((item) => object(item) && item.id === comparison)
        : null;
      if (
        object(chosen) &&
        typeof chosen.selection === "string" &&
        typeof chosen.reference === "string"
      )
        value.comparisonLabel = `${chosen.selection} / ${chosen.reference}`;
      if (!controller.signal.aborted) setState({ key, value });
    })().catch(() => {
      if (!controller.signal.aborted) setState({ key, failed: true });
    });
    return () => controller.abort();
  }, [key, attempt]);
  return {
    value: state?.key === key ? state.value : undefined,
    failed: state?.key === key && state.failed,
    unavailable: !validSource,
    retry: () => retry((value) => value + 1),
  };
}
