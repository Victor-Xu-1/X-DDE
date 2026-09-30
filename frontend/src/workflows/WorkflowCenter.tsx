import { useEffect, useRef, useState } from "react";
import { api, request } from "../api";
import type { Job, Language } from "../types";
import { JsonEditor } from "../operations/ScientificInputs";
import { RunMonitor } from "./RunMonitor";
import { hasExternalCalls, planFromJobs } from "./model";
import type { WorkflowPlan, WorkflowPlanInput, WorkflowRun } from "./types";
export function WorkflowCenter({
  language,
  jobs,
}: {
  language: Language;
  jobs: Job[];
}) {
  const zh = language === "zh",
    [name, setName] = useState(""),
    [ids, setIds] = useState<string[]>([""]);
  const [hours, setHours] = useState(1),
    [handoffs, setHandoffs] = useState<Set<number>>(new Set());
  const [expert, setExpert] = useState(false),
    [native, setNative] = useState<Record<string, unknown>>({
      name: "Research plan",
      steps: [],
      budget: { max_jobs: 30, wall_seconds: 3600 },
    });
  const [plans, setPlans] = useState<WorkflowPlan[]>([]),
    [selected, setSelected] = useState<WorkflowPlan | null>(null);
  const [run, setRun] = useState<WorkflowRun | null>(null),
    [history, setHistory] = useState<WorkflowRun[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [external, setExternal] = useState(false);
  const intent = useRef({ body: "", key: crypto.randomUUID() }),
    runKey = useRef(crypto.randomUUID());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const c = new AbortController();
    void request<WorkflowRun[]>("/workflows/runs", { signal: c.signal })
      .then((values) => {
        if (!c.signal.aborted) setHistory(values);
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
        setRun(value);
        setHistory((old) => [value, ...old.filter((r) => r.id !== value.id)]);
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="tool-form">
      <p className="notice">
        {zh
          ? "选择已准备任务作为模板，保存一个连续研究计划。保存不会执行计算；确认计划后才运行。每一步复用现有任务队列和资产版本。"
          : "Choose prepared tasks as templates and save a research plan. Saving does not run computation; start after reviewing the plan. Each step uses the existing task queue and asset versions."}
      </p>
      <div className="segmented">
        <button
          type="button"
          aria-pressed={!expert}
          onClick={() => setExpert(false)}
        >
          {zh ? "选择任务组装" : "Assemble from tasks"}
        </button>
        <button
          type="button"
          aria-pressed={expert}
          onClick={() => {
            try {
              setNative(
                planFromJobs(
                  name,
                  ids,
                  jobs,
                  handoffs,
                  hours,
                ) as unknown as Record<string, unknown>,
              );
            } catch (e) {
              setError(
                (zh
                  ? "任务模板尚不完整，可以继续直接编辑专家计划："
                  : "Task templates are incomplete; edit the expert plan directly: ") +
                  String(e),
              );
            }
            setExpert(true);
          }}
        >
          {zh ? "专家完整计划" : "Expert plan"}
        </button>
      </div>
      {!expert ? (
        <>
          <label className="field">
            {zh ? "计划名称" : "Plan name"}
            <input
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {ids.map((id, index) => (
            <section key={index}>
              <label className="field">
                {zh ? "步骤" : "Step"} {index + 1}
                <select
                  value={id}
                  onChange={(e) => {
                    setIds(
                      ids.map((v, n) => (n === index ? e.target.value : v)),
                    );
                    setHandoffs(
                      new Set([...handoffs].filter((n) => n !== index)),
                    );
                  }}
                >
                  <option value="">
                    {zh ? "选择一个已经准备好的任务" : "Choose a prepared task"}
                  </option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.request.name} · {j.request.operation ?? "predict"} ·{" "}
                      {j.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              {index > 0 &&
                jobs.find((j) => j.id === id)?.request.operation ===
                  "properties" && (
                  <label>
                    <input
                      type="checkbox"
                      checked={handoffs.has(index)}
                      onChange={(e) =>
                        setHandoffs(
                          e.target.checked
                            ? new Set([...handoffs, index])
                            : new Set([...handoffs].filter((n) => n !== index)),
                        )
                      }
                    />
                    {zh
                      ? "使用上一步生成的 molecules 输出第一个分子，不使用模板中的旧分子"
                      : "Use the first molecule from the preceding step's molecular output instead of the template's old input"}
                  </label>
                )}
            </section>
          ))}
          <div className="editor-toolbar">
            <button
              type="button"
              disabled={ids.length >= 30}
              onClick={() => setIds([...ids, ""])}
            >
              {zh ? "添加下一步" : "Add next step"}
            </button>
            <button
              type="button"
              disabled={ids.length <= 1}
              onClick={() => {
                setIds(ids.slice(0, -1));
                setHandoffs(
                  new Set([...handoffs].filter((n) => n < ids.length - 1)),
                );
              }}
            >
              {zh ? "移除最后一步" : "Remove last step"}
            </button>
          </div>
          <label className="field">
            {zh ? "整个计划最多运行多久？" : "Maximum elapsed plan time?"}
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            >
              {[1, 4, 8, 24].map((n) => (
                <option value={n} key={n}>
                  {n} {zh ? "小时" : "hours"}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <JsonEditor
          value={native}
          onChange={setNative}
          label={
            zh
              ? "完整计划、依赖、输出角色与预算"
              : "Full plan, dependencies, output roles and budget"
          }
        />
      )}
      <button
        type="button"
        className="primary-button"
        disabled={busy}
        onClick={() => void save()}
      >
        {zh ? "保存计划（不执行）" : "Save plan without running"}
      </button>
      <label className="field">
        {zh ? "打开已保存计划" : "Open a saved plan"}
        <select
          value={selected?.id ?? ""}
          onChange={(e) => {
            setSelected(plans.find((p) => p.id === e.target.value) ?? null);
            setRun(null);
            setExternal(false);
            runKey.current = crypto.randomUUID();
          }}
        >
          <option value="">—</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.body.name} · {p.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <section className="setup-card">
          <h2>{selected.body.name}</h2>
          <p>
            {zh ? "步骤数量" : "Steps"}: {selected.body.steps.length} ·{" "}
            {zh ? "任务预算" : "Job budget"}: {selected.body.budget.max_jobs}
          </p>
          <ol>
            {selected.body.steps.map((s) => (
              <li key={s.id}>
                {s.id} · {s.request.name} · {s.request.operation ?? "predict"}
              </li>
            ))}
          </ol>
          <details>
            <summary>
              {zh
                ? "查看不可变计划与校验摘要"
                : "Inspect immutable plan and digest"}
            </summary>
            <pre>{JSON.stringify(selected.body, null, 2)}</pre>
            <p>{selected.sha256}</p>
          </details>
          {hasExternalCalls(selected.body) && (
            <label>
              <input
                type="checkbox"
                checked={external}
                onChange={(e) => setExternal(e.target.checked)}
              />
              {zh
                ? "确认本计划会调用已配置的外部服务并发送相关输入，可能产生费用。"
                : "Confirm this plan may send inputs to configured external services and incur costs."}
            </label>
          )}
          <button
            className="primary-button"
            type="button"
            disabled={
              busy || !!run || (hasExternalCalls(selected.body) && !external)
            }
            onClick={() => void start()}
          >
            {zh ? "运行这个计划" : "Run this plan"}
          </button>
        </section>
      )}
      <label className="field">
        {zh ? "打开历史运行（刷新后仍保留）" : "Open a persisted run"}
        <select
          value={run?.id ?? ""}
          onChange={(e) =>
            setRun(history.find((r) => r.id === e.target.value) ?? null)
          }
        >
          <option value="">—</option>
          {history.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id.slice(0, 8)} · {r.state}
            </option>
          ))}
        </select>
      </label>
      {run && ["succeeded", "failed", "cancelled"].includes(run.state) && (
        <button
          type="button"
          onClick={() => {
            setRun(null);
            runKey.current = crypto.randomUUID();
          }}
        >
          {zh
            ? "为所选计划准备一次新运行"
            : "Prepare a new run of the selected plan"}
        </button>
      )}
      {run && <RunMonitor key={run.id} initial={run} language={language} />}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
