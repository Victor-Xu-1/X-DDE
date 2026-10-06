import { useEffect, useState } from "react";
import { request } from "../api";
import type { Asset } from "../operations/types";
export interface InputPreview {
  columns: string[];
  rows: Record<string, string>[];
  format: string;
  table: boolean;
  sdf_properties?: string[];
}
export function useTablePreview(asset: Asset | null) {
  const [preview, setPreview] = useState<InputPreview | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    setPreview(null);
    setError("");
    if (!asset) return;
    const c = new AbortController();
    void request<InputPreview>(`/datasets/files/${asset.id}/preview`, {
      signal: c.signal,
    })
      .then((value) => {
        if (!c.signal.aborted) setPreview(value);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [asset?.id]);
  return { preview, error };
}
