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
  callbacks.current = { onChange, onAsset };
  const mounted = useRef(true),
    intent = useRef(0),
    baseValue = useRef(value);
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
    if (busy && value && value !== baseValue.current) {
      intent.current++;
      setBusy(false);
    }
  }, [value]);
  async function upload(file: File) {
    const number = ++intent.current;
    baseValue.current = value;
    callbacks.current.onChange("");
    setError("");
    if (file.size < 1 || file.size > maxBytes) {
      setError("size");
      return;
    }
    if (!formats.some((suffix) => file.name.toLowerCase().endsWith(suffix))) {
      setError("format");
      return;
    }
    setBusy(true);
    try {
      const asset = await api.upload(file, kind);
      if (!mounted.current || number !== intent.current) return;
      if (!acceptedAsset(asset, asset.id, kind, formats, maxBytes))
        throw new Error("Invalid upload receipt");
      callbacks.current.onAsset(asset);
      callbacks.current.onChange(asset.id);
    } catch (error) {
      if (mounted.current && number === intent.current) setError(String(error));
    } finally {
      if (mounted.current && number === intent.current) setBusy(false);
    }
  }
  return { busy, error, upload, clearError: () => setError("") };
}
