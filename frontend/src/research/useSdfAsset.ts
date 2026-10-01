import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "../api";
import type { Asset } from "../operations/types";
import type { Language } from "../types";

export function useSdfAsset(language: Language, maxBytes = 25 * 1024 ** 2) {
  const intent = useRef(0);
  const languageRef = useRef(language);
  languageRef.current = language;
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      intent.current++;
    },
    [],
  );
  const choose = useCallback(
    async (id: string) => {
      const current = ++intent.current;
      setAsset(null);
      setError("");
      setLoading(Boolean(id));
      if (!id) return;
      try {
        const value = await request<Asset>(
          `/assets/${encodeURIComponent(id)}/metadata`,
        );
        if (current !== intent.current) return;
        if (
          value.id !== id ||
          value.kind !== "ligand" ||
          value.suffix !== ".sdf" ||
          !Number.isInteger(value.size) ||
          value.size < 1 ||
          value.size > maxBytes ||
          !/^[a-f0-9]{64}$/.test(value.sha256)
        )
          throw new Error(
            languageRef.current === "zh"
              ? `请选择不超过 ${maxBytes / 1024 ** 2} MB 的 SDF 文件。`
              : `Choose an SDF file no larger than ${maxBytes / 1024 ** 2} MB.`,
          );
        setAsset(value);
        return value;
      } catch (e) {
        if (current === intent.current)
          setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (current === intent.current) setLoading(false);
      }
    },
    [maxBytes],
  );
  return { asset, loading, error, choose };
}
