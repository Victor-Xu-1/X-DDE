import { useEffect, useState } from "react";
import type { MoleculeRef } from "../research/types";
import type { Asset } from "./types";
import { harnessAssetIds, resolveHarnessSources } from "./harness-sources";

/** A changed draft immediately invalidates old metadata; late reads never regain ownership. */
export function useHarnessSources(
  payload: Record<string, unknown>,
  retained: readonly MoleculeRef[],
) {
  let ids: string[] = [],
    invalid = false;
  try {
    ids = harnessAssetIds(payload);
  } catch {
    invalid = true;
  }
  const key = JSON.stringify([ids, retained, invalid]);
  const [attempt, retry] = useState(0);
  const [state, setState] = useState<{
    key: string;
    assets: Asset[];
    references: MoleculeRef[];
    error: boolean;
  }>({ key: "", assets: [], references: [], error: false });
  useEffect(() => {
    if (invalid || !ids.length) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(30000),
    ]);
    void resolveHarnessSources(ids, retained, signal)
      .then((resolved) => {
        if (!signal.aborted) setState({ key, ...resolved, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, assets: [], references: [], error: true });
      });
    return () => controller.abort();
  }, [key, attempt]);
  const empty = !invalid && ids.length === 0;
  const current = state.key === key;
  const error = invalid || (current && state.error);
  return {
    ready: empty || (current && !error),
    loading: !invalid && ids.length > 0 && !current,
    error,
    assets: current && !error ? state.assets : [],
    references: empty
      ? [...retained]
      : current && !error
        ? state.references
        : [],
    retry: () => retry((value) => value + 1),
  };
}
