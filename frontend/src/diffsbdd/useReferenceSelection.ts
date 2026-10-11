import { useEffect, useRef, useState } from "react";
import type { MoleculeRef } from "../research/types";
import { ReferenceMetadataError, resolveReference } from "./reference-metadata";

export function useReferenceSelection(
  kind: "structure" | "ligand",
  formats: readonly string[],
  onChange: (reference: MoleculeRef | null) => void,
) {
  const key = kind + ":" + formats.join(",");
  const currentKey = useRef(key);
  currentKey.current = key;
  const controller = useRef<AbortController | null>(null);
  const last = useRef<{ id: string; reference?: MoleculeRef } | null>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  const [state, setState] = useState<{
    key: string;
    loading: boolean;
    error: "" | "identity" | "format" | "unavailable";
    requestedChoice: string;
  }>({ key, loading: false, error: "", requestedChoice: "" });
  function cancel() {
    controller.current?.abort();
    controller.current = null;
    last.current = null;
    setState({ key, loading: false, error: "", requestedChoice: "" });
  }
  useEffect(() => {
    return () => {
      controller.current?.abort();
      controller.current = null;
      last.current = null;
    };
  }, [key]);
  async function choose(id: string, reference?: MoleculeRef) {
    cancel();
    callback.current(null);
    if (!id) return;
    const current = new AbortController();
    controller.current = current;
    last.current = { id, reference };
    const requestedChoice = reference?.version_id
      ? "version:" + reference.version_id
      : "file:" + id;
    setState({ key, loading: true, error: "", requestedChoice });
    try {
      const value = await resolveReference(
        id,
        kind,
        formats,
        reference,
        AbortSignal.any([current.signal, AbortSignal.timeout(30000)]),
      );
      if (
        currentKey.current !== key ||
        controller.current !== current ||
        current.signal.aborted
      )
        return;
      callback.current(value);
      setState({ key, loading: false, error: "", requestedChoice: "" });
    } catch (error) {
      if (
        currentKey.current !== key ||
        controller.current !== current ||
        current.signal.aborted
      )
        return;
      setState({
        key,
        loading: false,
        requestedChoice,
        error:
          error instanceof ReferenceMetadataError ? error.code : "unavailable",
      });
    }
  }
  const visible =
    state.key === key
      ? state
      : { key, loading: false, error: "" as const, requestedChoice: "" };
  return {
    ...visible,
    choose,
    cancel,
    retry() {
      const selected = last.current;
      if (selected) void choose(selected.id, selected.reference);
    },
  };
}
