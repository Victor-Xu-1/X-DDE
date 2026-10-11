import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "../api";
import type { Asset } from "../operations/types";
import type { Language } from "../types";

export function useSdfAsset(language: Language, maxBytes = 25 * 1024 ** 2) {
  const intent = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const languageRef = useRef(language);
  languageRef.current = language;
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      intent.current++;
      controller.current?.abort();
    },
    [],
  );
  const accept = useCallback(
    (value: Asset, id: string, expectedSha?: string) => {
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
      if (expectedSha && value.sha256 !== expectedSha)
        throw new Error(
          languageRef.current === "zh"
            ? "文件详情与所选材料不一致，请选择原始文件。"
            : "File details do not match the selected input. Choose the original file.",
        );
      return value;
    },
    [maxBytes],
  );
  const choose = useCallback(
    async (id: string, expectedSha?: string) => {
      const current = ++intent.current;
      controller.current?.abort();
      const reading = new AbortController();
      controller.current = reading;
      setAsset(null);
      setError("");
      setLoading(Boolean(id));
      if (!id) return;
      try {
        const value = await request<Asset>(
          `/assets/${encodeURIComponent(id)}/metadata`,
          {
            signal: AbortSignal.any([
              reading.signal,
              AbortSignal.timeout(30000),
            ]),
          },
        );
        if (current !== intent.current) return;
        const accepted = accept(value, id, expectedSha);
        setAsset(accepted);
        return accepted;
      } catch {
        if (current === intent.current)
          setError(
            languageRef.current === "zh"
              ? "无法核对所选 SDF 文件，请选择符合要求的原始文件或重试。"
              : "The selected SDF file could not be verified. Choose a supported original file or retry.",
          );
      } finally {
        if (current === intent.current) setLoading(false);
      }
    },
    [accept],
  );
  const adopt = useCallback(
    (value: Asset, expectedSha?: string) => {
      intent.current++;
      controller.current?.abort();
      setLoading(false);
      setError("");
      try {
        setAsset(accept(value, value.id, expectedSha));
      } catch {
        setAsset(null);
        setError(
          languageRef.current === "zh"
            ? "请选择符合要求的原始 SDF 文件。"
            : "Choose a supported original SDF file.",
        );
      }
    },
    [accept],
  );
  return { asset, loading, error, choose, adopt };
}
