import { useEffect, useState } from "react";
import { request } from "../api";
import type { InputCatalog } from "../research/input-catalog";
import type { AssetKind } from "../operations/types";

export function useReferenceHistory(
  kind: AssetKind,
  formats: readonly string[],
  active: boolean,
  options: {
    query: string;
    page: number;
    selected: string;
    wholeFile: boolean;
  } = { query: "", page: 0, selected: "", wholeFile: false },
) {
  const params = new URLSearchParams({
    kind,
    limit: "25",
    offset: String(options.page * 25),
    scope: options.wholeFile ? "files" : "records",
  });
  for (const format of formats) params.append("formats", format);
  if (options.query.trim()) params.set("q", options.query.trim());
  if (options.selected) params.set("selected", options.selected);
  const key = `${active}:${params}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data: InputCatalog | null;
    error: boolean;
  }>({ key: "", data: null, error: false });
  useEffect(() => {
    const controller = new AbortController();
    if (!active) return;
    void request<InputCatalog>("/research/input-catalog?" + params, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
    })
      .then((data) => {
        if (
          !Array.isArray(data.items) ||
          !Number.isInteger(data.total) ||
          data.total < 0
        )
          throw new Error("Input history unavailable");
        if (!controller.signal.aborted) setState({ key, data, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, data: null, error: true });
      });
    return () => controller.abort();
  }, [key, attempt]);
  const data = active && state.key === key ? state.data : null;
  const sourceTasks = Object.fromEntries(
    [
      ...(data?.items ?? []),
      ...(data?.selected ? [data.selected] : []),
    ].flatMap((item) =>
      item.version && item.source_task
        ? [[item.version.id, item.source_task] as const]
        : [],
    ),
  );
  return {
    data,
    sourceTasks,
    files:
      data?.items
        .filter((item) => item.origin === "upload")
        .map((item) => item.asset) ?? [],
    versions:
      data?.items.flatMap((item) => (item.version ? [item.version] : [])) ?? [],
    selected: data?.selected ?? null,
    loading: active && (state.key !== key || (!state.data && !state.error)),
    error: active && state.key === key && state.error,
    retry: () => setAttempt((value) => value + 1),
  };
}
