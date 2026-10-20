import { historyChoiceLabel } from "../presentation/history-choice";
import { useEffect, useState } from "react";
import { GuidedSteps } from "../guided/Questionnaire";
import type { WorkflowRun } from "./types";
import type { Job, Language } from "../types";
import { JsonEditor } from "../operations/ScientificInputs";
import { RunMonitor, workflowStateLabel } from "./RunMonitor";
import { hasExternalCalls, planFromJobs } from "./model";
import { useWorkflowController } from "./useWorkflowController";
import { useExample } from "../examples/context";
export function WorkflowCenter({
  language,
  jobs,
}: {
  language: Language;
  jobs: Job[];
}) {
  const example = useExample();
  const [source, setSource] = useState<"draft" | "saved" | "case">(
    example?.workflow_plan ? "case" : "draft",
  );
  const {
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
  } = useWorkflowController(
    language,
    jobs,
    source === "case" ? (example?.workflow_plan ?? null) : null,
  );
  useEffect(() => {
    if (source !== "saved") {
      setSelected(null);
      setRun(null);
      setExternal(false);
      runKey.current = crypto.randomUUID();
    }
  }, [
    source,
    name,
    ids,
    hours,
    handoffs,
    expert,
    native,
    setSelected,
    setRun,
    setExternal,
    runKey,
  ]);
  const goal = (
    <>
      <label className="field">
        {zh
          ? "如何准备研究计划？"
          : "How should the research plan be prepared?"}
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
        >
          {example?.workflow_plan && (
            <option value="case">
              {zh ? "使用此模板" : "Use the fixed research example"}
            </option>
          )}
          <option value="draft">
            {zh ? "组装新计划" : "Assemble a new plan"}
          </option>
          <option value="saved">
            {zh ? "复用已保存计划" : "Reuse a saved plan"}
          </option>
        </select>
      </label>
      {source === "case" ? (
        <p className="field-help">
          {zh
            ? "沿着已复核的研究步骤计算。质控条件未通过时，会保留结果并停止后续步骤。"
            : "Follow the reviewed study steps. If required quality checks do not pass, retain the results and stop downstream steps."}
        </p>
      ) : source === "draft" ? (
        <>
          {" "}
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
          {!expert && (
            <>
              {" "}
              <label className="field">
                {zh ? "计划名称" : "Plan name"}
                <input
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            </>
          )}
        </>
      ) : (
        <>
          {" "}
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
              {plans.map((p, index) => (
                <option key={p.id} value={p.id}>
                  {historyChoiceLabel(p.body.name, index, zh, p.created_at)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </>
  );
  const inputs =
    source === "saved" ? (
      <p>
        {zh
          ? "沿用所选计划的任务、依赖和输入版本。"
          : "Reuse the selected plan's tasks, dependencies and input versions."}
      </p>
    ) : source === "case" && !expert ? (
      <>
        <ol>
          {example?.workflow_plan?.steps.map((step) => (
            <li key={step.id}>
              {step.request.name}
              {step.quality_gate && (
                <span className="field-help">
                  {zh
                    ? " · 必须通过指定实测检查"
                    : " · Required measured checks must pass"}
                </span>
              )}
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setExpert(true)}
        >
          {zh ? "专家微调" : "Expert settings"}
        </button>
      </>
    ) : expert ? (
      <JsonEditor
        value={native}
        onChange={setNative}
        label={
          zh
            ? "完整计划、依赖、输出角色与预算"
            : "Full plan, dependencies, output roles and budget"
        }
      />
    ) : (
      <>
        {" "}
        {ids.map((id, index) => (
          <section key={index}>
            <label className="field">
              {zh ? "步骤" : "Step"} {index + 1}
              <select
                value={id}
                onChange={(e) => {
                  setIds(ids.map((v, n) => (n === index ? e.target.value : v)));
                  setHandoffs(
                    new Set([...handoffs].filter((n) => n !== index)),
                  );
                }}
              >
                <option value="">
                  {zh ? "选择一个已经准备好的任务" : "Choose a prepared task"}
                </option>
                {jobs.map((j, index) => (
                  <option key={j.id} value={j.id}>
                    {historyChoiceLabel(
                      j.request.name,
                      index,
                      zh,
                      j.created_at,
                    )}
                  </option>
                ))}
              </select>
            </label>
            {index > 0 &&
              ["properties", "pose_quality"].includes(
                jobs.find((j) => j.id === id)?.request.operation ?? "",
              ) && (
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
                    ? "接收新计算的结构；姿势检查同时接收对应受体，并作为后续步骤的质控关卡"
                    : "Use newly computed structures; pose checks also receive the paired receptor and gate downstream steps"}
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
      </>
    );
  const settings =
    source === "draft" && !expert ? (
      <>
        {" "}
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
      <p>
        {zh
          ? "沿用计划中的预算和设置。"
          : "Use the plan's budget and settings."}
      </p>
    );
  const review = (
    <>
      {source !== "saved" && (
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void save()}
        >
          {zh ? "保存计划（不执行）" : "Save plan without running"}
        </button>
      )}
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
                {s.request.name}
                {s.quality_gate && (
                  <span className="field-help">
                    {zh
                      ? " · 质控通过后继续"
                      : " · Continue after required quality checks pass"}
                  </span>
                )}
              </li>
            ))}
          </ol>

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
        </section>
      )}
    </>
  );
  const draftValid =
    source === "case" && !expert
      ? Boolean(example?.workflow_plan)
      : expert
        ? Array.isArray(native.steps) && native.steps.length > 0
        : ids.length > 0 && ids.every(Boolean);
  return (
    <section>
      <GuidedSteps<WorkflowRun>
        language={language}
        busy={busy}
        error={error}
        ready={Boolean(
          selected && !run && (!hasExternalCalls(selected.body) || external),
        )}
        unavailable={
          zh
            ? "先保存并核对计划；如涉及外部服务，还需确认相关调用。"
            : "Save and review the plan; approve any external service calls before launch."
        }
        submitLabel={zh ? "运行这个计划" : "Run this plan"}
        onSubmit={start}
        resultTitle={zh ? "运行与结果" : "Progress and results"}
        renderResult={(value) => (
          <p role="status">
            {zh
              ? "计划已递交，下方显示实际运行状态与结果。"
              : "Plan submitted. Actual progress and results appear below."}{" "}
            {value.id}
          </p>
        )}
        steps={[
          {
            title: zh ? "选择方式" : "Choose source",
            content: goal,
            valid:
              source === "saved"
                ? Boolean(selected)
                : expert || Boolean(name.trim()),
          },
          {
            title: zh ? "选择任务" : "Choose tasks",
            content: inputs,
            valid: source === "saved" || draftValid,
          },
          {
            title: zh ? "选择方案" : "Choose settings",
            content: settings,
            valid: true,
          },
          {
            title: zh ? "确认启动" : "Review & start",
            content: review,
            valid: source === "saved" || draftValid,
          },
        ]}
      />
      <details open={Boolean(run)}>
        <summary>{zh ? "运行记录" : "Run history"}</summary>{" "}
        <label className="field">
          {zh ? "打开历史运行（刷新后仍保留）" : "Open a persisted run"}
          <select
            value={run?.id ?? ""}
            onChange={(e) =>
              setRun(history.find((r) => r.id === e.target.value) ?? null)
            }
          >
            <option value="">—</option>
            {history.map((r, index) => (
              <option key={r.id} value={r.id}>
                {historyChoiceLabel(
                  zh ? "运行" : "Run",
                  index,
                  zh,
                  r.created_at,
                )}{" "}
                · {workflowStateLabel(r.state, zh)}
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
        {run && (
          <RunMonitor
            key={run.id}
            initial={run}
            language={language}
            onChange={recordRun}
          />
        )}
      </details>
    </section>
  );
}
