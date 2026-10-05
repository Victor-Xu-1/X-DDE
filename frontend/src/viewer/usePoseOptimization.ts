import { useEffect, useRef, useState } from "react";
import { api, request } from "../api";
import type { Job, Status } from "../types";
import { optimizedPose } from "./pose-source";
import type { PreviewPose, SavedPose } from "./pose-types";

type Phase = Status | "idle" | "submitting" | "saving" | "error";
interface State {
  key: string;
  history: PreviewPose[];
  cursor: number;
  phase: Phase;
  job: string | null;
  error: unknown;
}

/** View history is local; durable poses and lineage belong to X-DDE's scientific store. */
export function usePoseOptimization(base: PreviewPose, index: number) {
  const key = JSON.stringify(base);
  const initial = (): State => ({
    key,
    history: [base],
    cursor: 0,
    phase: "idle",
    job: null,
    error: "",
  });
  const [state, setState] = useState<State>(initial);
  const [poll, setPoll] = useState(0);
  const epoch = useRef(0),
    submitting = useRef(false);
  const intent = useRef<{ body: string; key: string } | null>(null);
  const visible = state.key === key ? state : initial();
  const pose = visible.history[visible.cursor];
  const busy = [
    "submitting",
    "queued",
    "running",
    "cancelling",
    "saving",
  ].includes(visible.phase);

  useEffect(() => {
    epoch.current++;
    submitting.current = false;
    intent.current = null;
    setState(initial());
    return () => {
      epoch.current++;
    };
  }, [key]);

  useEffect(() => {
    if (
      !state.job ||
      state.key !== key ||
      !["queued", "running", "cancelling", "saving"].includes(state.phase)
    )
      return;
    const controller = new AbortController(),
      generation = epoch.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const valid = () =>
      !controller.signal.aborted && generation === epoch.current;
    const until = Date.now() + 30 * 60 * 1000;
    async function check() {
      try {
        const job = await request<Job>(`/jobs/${state.job}`, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(30000),
          ]),
        });
        if (!valid()) return;
        if (job.status === "succeeded") {
          setState((s) => ({ ...s, phase: "saving" }));
          const saved = await api.post<SavedPose>(
            `/research/poses/${job.id}/save`,
            {},
          );
          if (!valid()) return;
          if (saved.job_id !== job.id)
            throw new Error("Saved pose belongs to another task.");
          const next = optimizedPose(state.history[state.cursor], saved, index);
          setState((s) => {
            const history = [...s.history.slice(0, s.cursor + 1), next];
            return {
              ...s,
              history,
              cursor: history.length - 1,
              phase: "idle",
              error: "",
            };
          });
          intent.current = null;
          return;
        }
        if (["failed", "cancelled", "interrupted"].includes(job.status)) {
          intent.current = null;
          setState((s) => ({
            ...s,
            phase: job.status,
            error:
              job.status === "failed"
                ? job.error || "Minimization did not succeed."
                : "",
          }));
          return;
        }
        if (Date.now() > until)
          throw new Error(
            "The task continues in the background. Check Task records or refresh its progress.",
          );
        setState((s) =>
          s.phase === job.status ? s : { ...s, phase: job.status },
        );
        timer = setTimeout(() => void check(), 1000);
      } catch (error) {
        if (valid()) setState((s) => ({ ...s, phase: "error", error }));
      }
    }
    void check();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [state.job, state.key, key, poll]);

  async function minimize(forceField: "MMFF94s" | "UFF", iterations: number) {
    if (busy || submitting.current || !pose.source) return;
    const generation = epoch.current;
    submitting.current = true;
    const body = {
      source: pose.source,
      method: pose.receptor ? "receptor" : forceField,
      max_iterations: iterations,
      ...(pose.receptor
        ? { receptor: pose.receptor, coordinate_basis: "user_confirmed" }
        : {}),
    };
    const serialized = JSON.stringify(body);
    if (intent.current?.body !== serialized)
      intent.current = { body: serialized, key: crypto.randomUUID() };
    setState((s) => ({ ...s, phase: "submitting", error: "", job: null }));
    try {
      const job = await api.post<Job>(
        "/research/poses/minimize",
        body,
        intent.current.key,
      );
      if (generation === epoch.current) {
        setState((s) => ({ ...s, job: job.id, phase: "queued" }));
        setPoll((n) => n + 1);
      }
    } catch (error) {
      if (generation === epoch.current)
        setState((s) => ({ ...s, phase: "error", error }));
    } finally {
      if (generation === epoch.current) submitting.current = false;
    }
  }

  async function cancel() {
    if (!state.job || !busy || state.phase === "saving") return;
    const generation = epoch.current;
    try {
      await api.cancel(state.job);
      if (generation === epoch.current)
        setState((s) => ({ ...s, phase: "cancelling" }));
    } catch (error) {
      if (generation === epoch.current) setState((s) => ({ ...s, error }));
    }
  }
  return {
    pose,
    downloadUrl: pose.urls[index],
    busy,
    phase: visible.phase,
    error: visible.error,
    job: visible.job,
    cursor: visible.cursor,
    count: visible.history.length,
    minimize,
    cancel,
    refresh: () => {
      setState((s) => ({ ...s, phase: "queued", error: "" }));
      setPoll((n) => n + 1);
    },
    previous: () => {
      if (!busy)
        setState((s) => ({
          ...s,
          cursor: Math.max(0, s.cursor - 1),
          error: "",
        }));
    },
    next: () => {
      if (!busy)
        setState((s) => ({
          ...s,
          cursor: Math.min(s.history.length - 1, s.cursor + 1),
          error: "",
        }));
    },
  };
}
