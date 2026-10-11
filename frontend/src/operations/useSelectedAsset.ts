import { useEffect, useState } from "react";
import { request } from "../api";
import type { Asset, AssetKind } from "./types";
import { acceptedAsset } from "./asset-acceptance";

/** Only matching metadata is exposed; changing file/type cancels the previous read. */
export function useSelectedAsset(
  id: string,
  kind: AssetKind,
  formats: readonly string[],
  maxBytes: number,
  known: Asset | null,
) {
  const key = [id, kind, formats.join(","), maxBytes].join(":");
  const [state, setState] = useState<{
    key: string;
    asset: Asset | null;
    error: boolean;
  }>({ key: "", asset: null, error: false });
  const [attempt, setAttempt] = useState(0);
  const immediate =
    known && acceptedAsset(known, id, kind, formats, maxBytes) ? known : null;
  useEffect(() => {
    const controller = new AbortController();
    if (!id || immediate) return;
    setState({ key: "", asset: null, error: false });
    void request<Asset>(`/assets/${encodeURIComponent(id)}/metadata`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
    })
      .then((asset) => {
        if (!acceptedAsset(asset, id, kind, formats, maxBytes))
          throw new Error("Input metadata mismatch");
        if (!controller.signal.aborted) setState({ key, asset, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, asset: null, error: true });
      });
    return () => controller.abort();
  }, [key, immediate, attempt]);
  return {
    asset: immediate ?? (state.key === key ? state.asset : null),
    loading: Boolean(id && !immediate && state.key !== key),
    error: Boolean(!immediate && state.key === key && state.error),
    retry: () => setAttempt((value) => value + 1),
  };
}
