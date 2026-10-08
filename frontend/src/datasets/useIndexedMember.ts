import { useEffect, useRef, useState } from "react";
import { api, request } from "../api";
import type { ScientificObject } from "../research/types";

export interface IndexedMember {
  id: string;
  label: string;
  supplier: string;
  geometry: "unbound_conformer";
  sha256: string;
  report_sha256: string;
  url: string;
}
interface State {
  key: string;
  detail: IndexedMember | null;
  saved: ScientificObject | null;
  phase: "loading" | "ready" | "saving" | "error";
}
export function useIndexedMember(jobId: string, memberId: string | null) {
  const key = JSON.stringify([jobId, memberId]),
    latest = useRef(key);
  latest.current = key;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({
    key: "",
    detail: null,
    saved: null,
    phase: "loading",
  });
  useEffect(() => {
    if (!memberId) return;
    const controller = new AbortController();
    setState({ key, detail: null, saved: null, phase: "loading" });
    void request<IndexedMember>(
      `/datasets/${jobId}/members/detail?${new URLSearchParams({ member_id: memberId })}`,
      { signal: controller.signal },
    )
      .then((detail) => {
        const url = new URL(detail.url, location.origin);
        if (
          detail.id !== memberId ||
          detail.geometry !== "unbound_conformer" ||
          !/^[0-9a-f]{64}$/.test(detail.sha256) ||
          !/^[0-9a-f]{64}$/.test(detail.report_sha256) ||
          url.origin !== location.origin ||
          url.pathname !== `/api/datasets/${jobId}/members/structure` ||
          url.username ||
          url.password ||
          url.hash ||
          url.searchParams.getAll("member_id").length !== 1 ||
          url.searchParams.getAll("report_sha256").length !== 1 ||
          url.searchParams.get("member_id") !== memberId ||
          url.searchParams.get("report_sha256") !== detail.report_sha256
        )
          throw new Error("Invalid member identity");
        if (!controller.signal.aborted)
          setState({ key, detail, saved: null, phase: "ready" });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, detail: null, saved: null, phase: "error" });
      });
    return () => controller.abort();
  }, [key, jobId, memberId, attempt]);
  const current =
    state.key === key
      ? state
      : { key, detail: null, saved: null, phase: "loading" as const };
  async function preserve() {
    const detail = current.detail;
    if (!detail || current.phase === "saving" || current.saved) return;
    setState({ ...current, phase: "saving" });
    try {
      const saved = await api.post<ScientificObject>(
        `/datasets/${jobId}/members/preserve`,
        {
          member_id: detail.id,
          report_sha256: detail.report_sha256,
        },
      );
      if (
        saved.kind !== "molecule" ||
        saved.source_job !== jobId ||
        saved.reference.sha256 !== detail.sha256 ||
        saved.reference.record !== 0 ||
        saved.reference.conformer !== 0 ||
        saved.reference.version_id !== saved.id ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          saved.reference.asset_id,
        )
      )
        throw new Error("Invalid preserved member");
      if (latest.current === key)
        setState({ ...current, saved, phase: "ready" });
    } catch {
      if (latest.current === key) setState({ ...current, phase: "error" });
    }
  }
  return {
    ...current,
    preserve,
    retry: () => setAttempt((value) => value + 1),
  };
}
