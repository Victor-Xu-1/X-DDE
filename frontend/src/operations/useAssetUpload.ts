import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { acceptedAsset } from "./asset-acceptance";
import type { Asset, AssetKind } from "./types";

export function useAssetUpload(
  kind: AssetKind,
  formats: readonly string[],
  maxBytes: number,
  value: string,
  onChange: (id: string) => void,
  onAsset: (asset: Asset) => void,
) {
  const callbacks = useRef({ onChange, onAsset });
  const observedValue = useRef(value);
  observedValue.current = value;
  callbacks.current = { onChange, onAsset };
  const mounted = useRef(true),
    intent = useRef(0),
    baseValue = useRef(value);
  const preserving = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = kind + ":" + formats.join(",") + ":" + maxBytes;
  useEffect(() => {
    mounted.current = true;
    setBusy(false);
    return () => {
      mounted.current = false;
      intent.current++;
    };
  }, [key]);
  useEffect(() => {
    if (busy && (value || preserving.current) && value !== baseValue.current) {
      intent.current++;
      setBusy(false);
    }
  }, [value]);
  async function upload(
    file: File,
    options: { preserveSelection?: boolean; signal?: AbortSignal } = {},
  ): Promise<boolean> {
    if (options.signal?.aborted) return false;
    const number = ++intent.current;
    preserving.current = Boolean(options.preserveSelection);
    baseValue.current = value;
    if (!options.preserveSelection) callbacks.current.onChange("");
    setError("");
    if (file.size < 1 || file.size > maxBytes) {
      setError("size");
      return false;
    }
    if (!formats.some((suffix) => file.name.toLowerCase().endsWith(suffix))) {
      setError("format");
      return false;
    }
    setBusy(true);
    const cancel = () => {
      if (mounted.current && number === intent.current) {
        intent.current++;
        setBusy(false);
      }
    };
    options.signal?.addEventListener("abort", cancel, { once: true });
    try {
      const asset = await (options.signal
        ? api.upload(file, kind, options.signal)
        : api.upload(file, kind));
      if (
        !mounted.current ||
        number !== intent.current ||
        options.signal?.aborted ||
        (options.preserveSelection &&
          observedValue.current !== baseValue.current)
      )
        return false;
      if (!acceptedAsset(asset, asset.id, kind, formats, maxBytes))
        throw new Error("Invalid upload receipt");
      callbacks.current.onAsset(asset);
      callbacks.current.onChange(asset.id);
      return true;
    } catch (error) {
      if (
        mounted.current &&
        number === intent.current &&
        !options.signal?.aborted
      )
        setError(String(error));
      return false;
    } finally {
      options.signal?.removeEventListener("abort", cancel);
      if (mounted.current && number === intent.current) setBusy(false);
    }
  }
  return { busy, error, upload, clearError: () => setError("") };
}
