import { useEffect, useState } from "react";
import type { MoleculeRef } from "../research/types";
import { readFepSeries, type FepRecord } from "./fep-series";

export function useFepSeries(source: MoleculeRef | null) {
  const key = source ? JSON.stringify(source) : "";
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    records?: FepRecord[];
    error?: unknown;
  }>({ key });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key });
    if (!source) return;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(15000),
    ]);
    void readFepSeries(source, signal)
      .then((records) => {
        if (!controller.signal.aborted) setState({ key, records });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ key, error });
      });
    return () => controller.abort();
  }, [key, attempt]);
  const visible = state.key === key ? state : { key };
  return { ...visible, retry: () => setAttempt((value) => value + 1) };
}
