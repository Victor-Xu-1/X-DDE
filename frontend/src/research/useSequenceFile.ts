import { useEffect, useState } from "react";
import type { MoleculeRef } from "./types";
import { readSequenceFile, type FastaRecord } from "./fasta-file";

export function useSequenceFile(reference: MoleculeRef) {
  const key = JSON.stringify(reference);
  const [attempt, retry] = useState(0);
  const [state, setState] = useState<{
    key: string;
    records?: FastaRecord[];
    error?: unknown;
  }>({ key });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key });
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(15000),
    ]);
    void readSequenceFile(reference, signal)
      .then((records) => {
        if (!controller.signal.aborted) setState({ key, records });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ key, error });
      });
    return () => controller.abort();
  }, [key, attempt]);
  const visible = state.key === key ? state : { key };
  return { ...visible, retry: () => retry((value) => value + 1) };
}
