import { useEffect, useState } from "react";
import { api, request } from "../api";
import type { Language } from "../types";
import type { Plan } from "./campaign-model";
import { ResultTree } from "./OperationResults";
import { StructureViewer } from "../viewer/StructureViewer";

interface Snapshot {
  task_id: string;
  status: string;
  target: string;
  cycle: number;
  total_cycles: number;
  phase: string;
  selected_skill: string;
  error?: string;
  best_candidate?: Record<string, unknown>;
  final_candidates?: Record<string, unknown>[];
}
export function CampaignMonitor({
  language,
  revision,
  onRestore,
}: {
  language: Language;
  revision: number;
  onRestore?(plan: Plan): void;
}) {
  const zh = language === "zh",
    [plans, setPlans] = useState<Plan[]>([]),
    [selected, setSelected] = useState(""),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [candidates, setCandidates] = useState<Record<string, unknown>[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [count, setCount] = useState(8),
    [interval, setIntervalValue] = useState(20),
    [refresh, setRefresh] = useState(0);
  const [preview, setPreview] = useState("");
  const [report, setReport] = useState<unknown>(null);
  async function analyze(kind: string) {
    setBusy(true);
    setError("");
    setReport(null);
    try {
      setReport(
        await api.post(
          `/harness/campaigns/${selected}/analysis`,
          { kind },
          crypto.randomUUID(),
          190000,
        ),
      );
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const c = new AbortController();
    void request<Plan[]>("/harness/plans", { signal: c.signal })
      .then((p) => {
        setPlans(p);
        setSelected((old) => old || p.find((x) => x.task_id)?.task_id || "");
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [revision, refresh]);
  useEffect(() => {
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setSnapshot(null);
    setCandidates([]);
    setError("");
    const poll = async () => {
      try {
        const state = await request<Snapshot>(
          `/harness/campaigns/${selected}`,
          { signal: c.signal },
        );
        if (c.signal.aborted) return;
        setSnapshot(state);
        if (["queued", "running"].includes(state.status))
          timer = setTimeout(poll, 5000);
        else setCandidates(state.final_candidates ?? []);
      } catch (e) {
        if (!c.signal.aborted) setError(String(e));
      }
    };
    setPreview("");
    setReport(null);
    if (selected) void poll();
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [selected, refresh]);
  async function control(action: string, body: unknown = {}) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/harness/campaigns/${selected}/${action}`, body);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function loadCandidates() {
    setBusy(true);
    try {
      const result = await request<{ candidates: Record<string, unknown>[] }>(
        `/harness/campaigns/${selected}/candidates`,
      );
      setCandidates(result.candidates ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="campaign-monitor">
      <h3>{zh ? "设计任务与候选" : "Campaigns and candidates"}</h3>
      {plans.some((p) => !p.task_id) && (
        <details>
          <summary>
            {zh
              ? "恢复未启动 / 待核对的计划"
              : "Restore pending or uncertain plans"}
          </summary>
          {plans
            .filter((p) => !p.task_id)
            .map((p) => (
              <div className="draft-row" key={p.id}>
                <span>
                  {String(p.summary?.target ?? p.id)} · {p.state}
                </span>
                <button onClick={() => onRestore?.(p)}>
                  {zh ? "恢复并审阅" : "Restore and review"}
                </button>
              </div>
            ))}
        </details>
      )}
      <label className="field">
        {zh ? "查看设计任务" : "Inspect campaign"}
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">{zh ? "尚未选择" : "Choose a campaign"}</option>
          {plans
            .filter((p) => p.task_id)
            .map((p) => (
              <option value={p.task_id!} key={p.id}>
                {String(p.summary?.target ?? p.task_id)}
              </option>
            ))}
        </select>
      </label>
      <button onClick={() => setRefresh((n) => n + 1)} disabled={busy}>
        {zh ? "刷新" : "Refresh"}
      </button>
      {snapshot && (
        <>
          <div className="campaign-status">
            <strong>{snapshot.target}</strong>
            <span className={`status ${snapshot.status}`}>
              {snapshot.status}
            </span>
            <p>
              {zh ? "已进入轮次" : "Current cycle"}: {snapshot.cycle} /{" "}
              {snapshot.total_cycles} · {snapshot.phase}
            </p>
            <progress
              max={Math.max(1, snapshot.total_cycles)}
              value={Math.max(0, snapshot.cycle)}
            />
            {snapshot.selected_skill && <p>{snapshot.selected_skill}</p>}
            {snapshot.error && (
              <p role="alert" className="error-box">
                {snapshot.error}
              </p>
            )}
          </div>
          {["queued", "running"].includes(snapshot.status) && (
            <details>
              <summary>
                {zh ? "运行中调整 / 停止" : "Adjust / stop campaign"}
              </summary>
              <label className="field">
                {zh ? "每轮提案数" : "Proposals per cycle"}
                <input
                  type="number"
                  min={1}
                  max={256}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </label>
              <label className="field">
                {zh ? "反思间隔（轮）" : "Reflection interval (cycles)"}
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={interval}
                  onChange={(e) => setIntervalValue(Number(e.target.value))}
                />
              </label>
              <button
                disabled={busy}
                onClick={() =>
                  void control("adjust", {
                    num_sequences: count,
                    reflection_interval: interval,
                  })
                }
              >
                {zh ? "在下一安全边界应用" : "Apply at the next safe boundary"}
              </button>
              <button
                className="danger-button"
                disabled={busy}
                onClick={() => void control("stop")}
              >
                {zh ? "请求停止设计" : "Request campaign stop"}
              </button>
            </details>
          )}
          <button disabled={busy} onClick={() => void loadCandidates()}>
            {zh ? "读取当前最佳候选" : "Load top candidates"}
          </button>
          <a
            href={`/api/harness/campaigns/${selected}/candidates.json?top_k=100`}
            download="candidates.json"
          >
            {zh ? "下载候选集用于比较" : "Download population for comparison"}
          </a>
          <div className="task-actions">
            {(
              [
                ["epitope", "最佳候选表位分析", "Best-candidate epitope"],
                [
                  "structure",
                  "前三名相互作用分析",
                  "Top-three interaction analysis",
                ],
                [
                  "evolution",
                  "完整搜索历史与进化分析",
                  "Full search history and evolution",
                ],
              ] as const
            ).map(([id, cn, en]) => (
              <button disabled={busy} key={id} onClick={() => void analyze(id)}>
                {zh ? cn : en}
              </button>
            ))}
          </div>
          {busy && (
            <p role="status">
              {zh
                ? "正在读取原生任务或生成分析报告…"
                : "Reading native task state or generating analysis…"}
            </p>
          )}
          {report != null && <ResultTree value={report} zh={zh} />}
          {candidates.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{zh ? "候选" : "Candidate"}</th>
                    <th>{zh ? "目标分数" : "Objective"}</th>
                    <th>{zh ? "序列" : "Sequence"}</th>
                    <th>{zh ? "详情" : "Details"}</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c, i) => (
                    <tr key={i}>
                      <td>{String(c.candidate_id ?? i + 1)}</td>
                      <td>{c.objective == null ? "—" : String(c.objective)}</td>
                      <td className="sequence-cell">
                        {String(c.sequence ?? "")}
                      </td>
                      <td>
                        {Boolean(c.structure_path) && (
                          <button
                            onClick={() => setPreview(String(c.candidate_id))}
                          >
                            {zh ? "查看结构" : "View structure"}
                          </button>
                        )}
                        <details>
                          <summary>
                            {zh ? "指标与来源" : "Metrics and provenance"}
                          </summary>
                          <ResultTree value={c} zh={zh} />
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              {zh
                ? "尚无候选结果；任务运行后点击读取。"
                : "No candidates loaded; retrieve them after the campaign makes progress."}
            </p>
          )}
          {preview && (
            <StructureViewer
              language={language}
              urls={[
                `/api/harness/campaigns/${selected}/structure?${new URLSearchParams({ candidate_id: preview })}`,
              ]}
            />
          )}
        </>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
