import { useCallback, useEffect, useState } from "react";
import { api, request } from "../api";
import type { ScientificObject } from "../research/types";
export function usePoseAssets(jobId: string) {
  const [versions, setVersions] = useState<ScientificObject[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setVersions([]);
    setError("");
    async function load() {
      const all: ScientificObject[] = [];
      for (let offset = 0; offset < 1000; offset += 200) {
        const page = await request<ScientificObject[]>(
          `/research/objects?source_job=${encodeURIComponent(jobId)}&limit=200&offset=${offset}`,
          { signal: c.signal },
        );
        all.push(...page);
        if (page.length < 200) break;
      }
      if (!c.signal.aborted) setVersions(all);
    }
    void load().catch((e) => {
      if (!c.signal.aborted) setError(String(e));
    });
    return () => c.abort();
  }, [jobId, revision]);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api.post<{
        state: string;
        errors: { reason: string }[];
      }>(`/jobs/${jobId}/index-assets`, {});
      setRevision((v) => v + 1);
      if (result.state !== "complete")
        setError(result.errors.map((v) => v.reason).join("; "));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [jobId]);
  return { versions, error, busy, refresh };
}
