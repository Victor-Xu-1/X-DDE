import { useEffect, useRef, useState } from "react";
import { api, request } from "../api";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import type { IdentityResult } from "../diffsbdd/types";
import { validIdentity } from "./model";
// Callers key this hook's component by the complete immutable subject reference.
export function useNativeIdentity(initial: MoleculeRef, language: Language) {
  const zh = language === "zh",
    [job, setJob] = useState<Job | null>(null),
    [result, setResult] = useState<IdentityResult | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    attempt = useRef(crypto.randomUUID());
  const retryIntent = useRef({ parent: "", key: crypto.randomUUID() });
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (!job || !["queued", "running", "cancelling"].includes(job.status))
      return;
    const c = new AbortController();
    const timer = setTimeout(() => {
      void request<Job>(`/jobs/${job.id}`, { signal: c.signal })
        .then((current) => {
          if (!c.signal.aborted) setJob(current);
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(String(e));
        });
    }, 1200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [job, refresh]);
  useEffect(() => {
    if (job?.status !== "succeeded") return;
    const c = new AbortController();
    void api
      .result(job.id, c.signal)
      .then((data) => {
        const r = data as unknown as IdentityResult;
        if (!validIdentity(r, initial))
          throw new Error(
            "Atom identity does not match the selected input version.",
          );
        if (!c.signal.aborted) setResult(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [job?.id, job?.status, refresh]);
  const running =
    busy || (!!job && ["queued", "running", "cancelling"].includes(job.status));
  async function inspect() {
    setBusy(true);
    setError("");
    try {
      if (
        job &&
        ["queued", "running", "cancelling", "succeeded"].includes(job.status)
      ) {
        setRefresh((value) => value + 1);
        return;
      }
      if (
        job &&
        !["queued", "running", "cancelling"].includes(job.status) &&
        retryIntent.current.parent !== job.id
      )
        retryIntent.current = { parent: job.id, key: crypto.randomUUID() };
      const created =
        job && !["queued", "running", "cancelling"].includes(job.status)
          ? await api.retry(job.id, retryIntent.current.key)
          : await api.submit(
              {
                operation: "diffsbdd",
                name: zh
                  ? "读取分子原子身份"
                  : "Inspect molecular atom identities",
                payload: { mode: "identity", molecule: initial },
              },
              attempt.current,
            );
      if (live.current) setJob(created);
    } catch (e) {
      if (live.current) setError(String(e));
    } finally {
      if (live.current) setBusy(false);
    }
  }

  return {
    job,
    result,
    error,
    running,
    inspect,
    refresh: () => {
      setError("");
      setRefresh((value) => value + 1);
    },
  };
}
