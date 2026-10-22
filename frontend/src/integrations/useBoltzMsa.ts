import { useEffect, useState } from "react";
import { api } from "../api";
import type { MoleculeRef } from "../research/types";
import { referenceKey } from "../research/input-catalog";

export interface MsaInspection {
  rows: number;
  unique_sequences: number;
  columns: number;
  name: string;
}

/** A response belongs to both the exact file and exact protein, never the previous chain. */
export function useBoltzMsa(reference: MoleculeRef | null, sequence: string) {
  const key = reference
    ? JSON.stringify([referenceKey(reference), sequence])
    : "";
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([key, attempt]);
  const [state, setState] = useState<{
    key: string;
    value: MsaInspection | null;
    error: boolean;
  }>({ key: "", value: null, error: false });
  useEffect(() => {
    if (!reference || !sequence) return;
    const controller = new AbortController();
    void api
      .authorized<MsaInspection>("/scientific/boltz/msa-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, sequence }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(30000),
        ]),
      })
      .then((value) => {
        if (
          !Number.isSafeInteger(value.rows) ||
          value.rows < 1 ||
          !Number.isSafeInteger(value.unique_sequences) ||
          value.unique_sequences < 1 ||
          value.unique_sequences > value.rows ||
          value.columns !== sequence.length ||
          typeof value.name !== "string"
        )
          throw new Error("Invalid alignment inspection");
        if (!controller.signal.aborted)
          setState({ key: requestKey, value, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key: requestKey, value: null, error: true });
      });
    return () => controller.abort();
  }, [key, attempt]);
  return {
    value: key && state.key === requestKey ? state.value : null,
    error: Boolean(key && state.key === requestKey && state.error),
    retry: () => setAttempt((value) => value + 1),
  };
}
