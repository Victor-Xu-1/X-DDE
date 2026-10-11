import { useEffect, useState } from "react";
import { api, request } from "../api";
import type { Asset } from "../operations/types";
import type { ScientificObject } from "../research/types";

export async function readReferenceHistory(signal: AbortSignal) {
  const versions: ScientificObject[] = [];
  for (let offset = 0; offset < 10000; offset += 200) {
    const page = await request<ScientificObject[]>(
      `/research/objects?limit=200&offset=${offset}`,
      { signal },
    );
    signal.throwIfAborted();
    if (!Array.isArray(page)) throw new Error("History unavailable");
    versions.push(...page);
    if (page.length < 200) break;
    if (offset === 9800) {
      const extra = await request<ScientificObject[]>(
        "/research/objects?limit=1&offset=10000",
        { signal },
      );
      if (!Array.isArray(extra) || extra.length)
        throw new Error("History exceeds the supported selection window");
    }
  }
  const first = await api.assets(signal);
  if (!Array.isArray(first)) throw new Error("Files unavailable");
  const files = [...first];
  if (files.length === 100) {
    for (let offset = 100; offset <= 10000; offset += 100) {
      const page = await request<Asset[]>(
        `/assets?limit=100&offset=${offset}`,
        { signal },
      );
      signal.throwIfAborted();
      if (!Array.isArray(page)) throw new Error("Files unavailable");
      if (offset === 10000 && page.length)
        throw new Error("Files exceed the supported selection window");
      files.push(...page);
      if (page.length < 100) break;
    }
  }
  signal.throwIfAborted();
  return {
    versions: [
      ...new Map(versions.map((version) => [version.id, version])).values(),
    ],
    files: [...new Map(files.map((file) => [file.id, file])).values()],
  };
}

export function useReferenceHistory(
  kind: "structure" | "ligand",
  formats: readonly string[],
  active: boolean,
) {
  const key = `${kind}:${formats.join(",")}:${active}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    loading: boolean;
    error: boolean;
    files: Asset[];
    versions: ScientificObject[];
  }>({ key, loading: active, error: false, files: [], versions: [] });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, loading: active, error: false, files: [], versions: [] });
    if (!active) return;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(30000),
    ]);
    void readReferenceHistory(signal)
      .then(({ files, versions }) => {
        if (!controller.signal.aborted)
          setState({
            key,
            loading: false,
            error: false,
            files: files.filter(
              (file) => file.kind === kind && formats.includes(file.suffix),
            ),
            versions: versions.filter(
              (version) =>
                version.kind ===
                (kind === "structure" ? "structure" : "molecule"),
            ),
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({
            key,
            loading: false,
            error: true,
            files: [],
            versions: [],
          });
      });
    return () => controller.abort();
  }, [key, attempt]);
  const visible =
    state.key === key
      ? state
      : { key, loading: active, error: false, files: [], versions: [] };
  return { ...visible, retry: () => setAttempt((value) => value + 1) };
}
