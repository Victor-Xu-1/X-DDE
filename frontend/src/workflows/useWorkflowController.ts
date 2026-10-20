import { useCallback, useEffect, useRef, useState } from "react";
import { api, request } from "../api";
import type { Job, Language } from "../types";
import { planFromJobs } from "./model";
import type { WorkflowPlan, WorkflowRun, WorkflowPlanInput } from "./types";
export function useWorkflowController(
  language: Language,
  jobs: Job[],
  preset: WorkflowPlanInput | null = null,
  initial: { plan: WorkflowPlan; run: WorkflowRun } | null = null,
) {
  const zh = language === "zh",
    [name, setName] = useState(preset?.name ?? ""),
    [ids, setIds] = useState<string[]>([""]);
  const [hours, setHours] = useState(1),
    [handoffs, setHandoffs] = useState<Set<number>>(new Set());
  const [expert, setExpert] = useState(false),
    [native, setNative] = useState<Record<string, unknown>>(
      preset
        ? (structuredClone(preset) as unknown as Record<string, unknown>)
        : {
            name: "Research plan",
            steps: [],
            budget: { max_jobs: 30, wall_seconds: 3600 },
          },
    );
  const [plans, setPlans] = useState<WorkflowPlan[]>([]),
    [selected, setSelected] = useState<WorkflowPlan | null>(
      initial?.plan ?? null,
    );
  const [run, setRun] = useState<WorkflowRun | null>(initial?.run ?? null),
    [history, setHistory] = useState<WorkflowRun[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [external, setExternal] = useState(false);
  const intent = useRef({ body: "", key: crypto.randomUUID() }),
    runKey = useRef(crypto.randomUUID());
  const mounted = useRef(true);
  const recordRun = useCallback((value: WorkflowRun) => {
    if (!mounted.current) return;
    setRun(value);
    setHistory((previous) => {
      const existing = previous.find((row) => row.id === value.id);
      if (existing === value) return previous;
      return existing
        ? previous.map((row) => (row.id === value.id ? value : row))
        : [value, ...previous];
    });
  }, []);
  useEffect(() => {
    mounted.current = true;
    const c = new AbortController();
    void request<WorkflowRun[]>("/workflows/runs", { signal: c.signal })
      .then((values) => {
        if (!c.signal.aborted)
          setHistory((previous) => {
            const known = new Set(previous.map((row) => row.id));
            return [...previous, ...values.filter((row) => !known.has(row.id))];
          });
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    void request<WorkflowPlan[]>("/workflows/plans", { signal: c.signal })
      .then((values) => {
        if (!c.signal.aborted) setPlans(values);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => {
      mounted.current = false;
      c.abort();
    };
  }, []);
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const value = expert
          ? native
          : preset
            ? {
                ...preset,
                name: name.trim() || preset.name,
              }
            : planFromJobs(name, ids, jobs, handoffs, hours),
        body = JSON.stringify(value);
      if (intent.current.body !== body)
        intent.current = { body, key: crypto.randomUUID() };
      const plan = await api.post<WorkflowPlan>(
        "/workflows/plans",
        value,
        intent.current.key,
      );
      if (mounted.current) {
        setSelected(plan);
        setPlans((old) => [plan, ...old.filter((p) => p.id !== plan.id)]);
        setRun(null);
        setExternal(false);
        runKey.current = crypto.randomUUID();
        return plan;
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function start() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const value = await api.post<WorkflowRun>(
        `/workflows/plans/${selected.id}/runs`,
        { plan_sha256: selected.sha256 },
        runKey.current,
      );
      if (mounted.current) {
        recordRun(value);
        return value;
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return {
    zh,
    name,
    setName,
    ids,
    setIds,
    hours,
    setHours,
    handoffs,
    setHandoffs,
    expert,
    setExpert,
    native,
    setNative,
    plans,
    selected,
    setSelected,
    run,
    setRun,
    recordRun,
    history,
    error,
    setError,
    busy,
    external,
    setExternal,
    runKey,
    save,
    start,
  };
}
