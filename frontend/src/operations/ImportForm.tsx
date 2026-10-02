import { useEffect, useRef, useState } from "react";
import { useExampleReference, useExampleTask } from "../examples/context";
import { api } from "../api";
import type { Job, Language, Prediction } from "../types";
import { AssetPicker } from "./AssetPicker";
import { useTaskSubmit } from "./useTaskSubmit";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";

export function ImportForm({
  language,
  jobs,
  onCreated,
  onDraft,
}: {
  language: Language;
  jobs: Job[];
  onCreated(j: Job): void;
  onDraft(p: Prediction): void;
}) {
  const example = useExampleReference("brd4", "her2", "mz1", "rna");
  const preset = useExampleTask("json");
  const zh = language === "zh",
    [structure, setStructure] = useState(example?.asset_id ?? ""),
    [structures, setStructures] = useState<string[]>([]),
    [config, setConfig] = useState(""),
    [altloc, setAltloc] = useState(preset?.altloc ?? "first"),
    [assembly, setAssembly] = useState(""),
    [bonds, setBonds] = useState(false),
    [source, setSource] = useState(""),
    [artifact, setArtifact] = useState(""),
    [artifacts, setArtifacts] = useState<string[]>([]),
    [drafts, setDrafts] = useState<Prediction[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    run = useTaskSubmit(onCreated),
    key = useRef({ body: "", id: crypto.randomUUID() });
  const [mode, setMode] = useState<"structure" | "config" | "result">(
      "structure",
    ),
    [reviewed, setReviewed] = useState(false);
  const { ready, error: readinessError } = useTaskReadiness(
    mode === "structure" ? "import" : "predict",
  );
  useEffect(() => {
    const c = new AbortController();
    setArtifacts([]);
    setDrafts([]);
    setReviewed(false);
    setArtifact("");
    if (source)
      void api
        .result(source, c.signal)
        .then((result) => setArtifacts(result.documents ?? []))
        .catch((e) => {
          if (!c.signal.aborted) setError(String(e));
        });
    return () => c.abort();
  }, [source]);
  async function load(path: string) {
    setBusy(true);
    setError("");
    try {
      setDrafts(await api.post<Prediction[]>(path, {}));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function batch() {
    const body = JSON.stringify(drafts);
    if (key.current.body !== body)
      key.current = { body, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const created = await api.post<Job[]>(
        "/batches",
        { tasks: drafts },
        key.current.id,
      );
      if (!Array.isArray(created) || created.length !== drafts.length)
        throw new Error(
          zh
            ? "任务返回数量不一致，请到任务记录核对；不要更换输入重复提交。"
            : "Unexpected task count. Inspect Task history before changing inputs and resubmitting.",
        );
      onCreated(created[0]);
      return created[0];
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const goal = (
    <label className="field">
      {zh ? "用什么准备任务？" : "How should tasks be prepared?"}
      <select
        value={mode}
        onChange={(e) => {
          setMode(e.target.value as typeof mode);
          setDrafts([]);
          setReviewed(false);
        }}
      >
        <option value="structure">
          {zh
            ? "将已有结构转换成预测输入"
            : "Convert existing structures to prediction input"}
        </option>
        <option value="config">
          {zh ? "导入已有任务文件" : "Import an existing task file"}
        </option>
        <option value="result">
          {zh ? "复用已完成任务的结果" : "Reuse completed task outputs"}
        </option>
      </select>
    </label>
  );
  const inputs =
    mode === "structure" ? (
      <>
        {" "}
        <AssetPicker
          kind="structure"
          value={structure}
          onChange={setStructure}
          language={language}
          label="PDB / CIF"
        />
        <button
          type="button"
          disabled={
            !structure ||
            structures.includes(structure) ||
            structures.length >= 20
          }
          onClick={() => setStructures([...structures, structure])}
        >
          {zh ? "加入转换列表" : "Add to conversion list"}
        </button>
        <p>
          {zh ? "已选择" : "Selected"}{" "}
          {structures.length || Number(Boolean(structure))}{" "}
          {zh ? "个文件" : "files"}
        </p>
      </>
    ) : mode === "config" ? (
      <>
        {" "}
        <AssetPicker
          kind="config"
          value={config}
          onChange={(id) => {
            setConfig(id);
            setDrafts([]);
            setReviewed(false);
          }}
          language={language}
          label={
            zh ? "已有的原生 OpenDDE JSON" : "Existing native OpenDDE JSON"
          }
        />
        <button
          type="button"
          disabled={busy || !config}
          onClick={() => void load(`/assets/${config}/import`)}
        >
          {zh ? "导入文件" : "Import file"}
        </button>
      </>
    ) : (
      <>
        {" "}
        <label className="field">
          {zh ? "来源任务" : "Source task"}
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{zh ? "选择任务" : "Choose task"}</option>
            {jobs
              .filter(
                (j) =>
                  j.status === "succeeded" &&
                  ["json", "msa", "mt", "prep"].includes(
                    j.request.operation ?? "",
                  ),
              )
              .map((j) => (
                <option value={j.id} key={j.id}>
                  {j.request.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          {zh ? "输入文件" : "Input file"}
          <select
            value={artifact}
            onChange={(e) => {
              setArtifact(e.target.value);
              setDrafts([]);
              setReviewed(false);
            }}
          >
            <option value="">{zh ? "选择 JSON" : "Choose JSON"}</option>
            {artifacts
              .filter((a) => a.endsWith(".json"))
              .map((a) => (
                <option key={a}>{a}</option>
              ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !source || !artifact}
          onClick={() =>
            void load(
              `/jobs/${source}/import?${new URLSearchParams({ name: artifact })}`,
            )
          }
        >
          {zh ? "复用结果" : "Reuse result"}
        </button>
      </>
    );
  const settings =
    mode === "structure" ? (
      <>
        {" "}
        <details>
          <summary>{zh ? "专家选项" : "Expert options"}</summary>
          <label className="field">
            {zh ? "交替构象" : "Alternate location"}
            <input
              value={altloc}
              maxLength={5}
              onChange={(e) => setAltloc(e.target.value)}
            />
          </label>
          <label className="field">
            {zh
              ? "生物组装编号（留空不扩展）"
              : "Assembly ID (blank = no expansion)"}
            <input
              value={assembly}
              maxLength={24}
              onChange={(e) => setAssembly(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={bonds}
              onChange={(e) => setBonds(e.target.checked)}
            />
            {zh
              ? "保留不连续聚合物连接"
              : "Include discontinuous polymer bonds"}
          </label>
        </details>
      </>
    ) : (
      <>
        {" "}
        <>
          <p>
            {zh
              ? "审阅后可逐项编辑，也可按原参数批量提交。"
              : "Review and edit each task, or submit the batch with its imported settings."}
          </p>
          {drafts.map((d, i) => (
            <div className="draft-row" key={i}>
              <span>
                {d.name} · {d.components.length} {zh ? "组分" : "components"}
              </span>
              <button type="button" onClick={() => onDraft(d)}>
                {zh ? "编辑并预测" : "Edit and predict"}
              </button>
              <button
                type="button"
                onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}
              >
                {zh ? "移出批次" : "Remove"}
              </button>
            </div>
          ))}
        </>
      </>
    );
  const review = (
    <>
      <dl className="questionnaire-review">
        <dt>{zh ? "此步操作" : "This action"}</dt>
        <dd>
          {mode === "structure"
            ? zh
              ? "转换输入，不执行结构预测"
              : "Convert inputs without structure prediction"
            : zh
              ? "按已审阅参数创建预测任务"
              : "Create prediction tasks using reviewed parameters"}
        </dd>
        <dt>{zh ? "数量" : "Count"}</dt>
        <dd>
          {mode === "structure"
            ? structures.length || Number(Boolean(structure))
            : drafts.length}
        </dd>
      </dl>
      {mode !== "structure" && (
        <label>
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          {zh
            ? "已核对所有导入任务及其参数；同意其中选定的计算和搜索服务调用。"
            : "I reviewed all imported tasks and parameters, including their selected compute and search service calls."}
        </label>
      )}
    </>
  );
  const inputValid =
    mode === "structure"
      ? Boolean(structure || structures.length)
      : drafts.length > 0;
  return (
    <Questionnaire
      language={language}
      ready={ready}
      busy={busy || run.busy}
      error={error || run.error || readinessError}
      unavailable={
        zh
          ? "本任务所需的转换或预测环境尚未配置。请到安装与组件配置；已导入内容保留。"
          : "Configure the required conversion or prediction environment in Installation & components. Imported inputs are retained."
      }
      submitLabel={
        mode === "structure"
          ? zh
            ? "开始转换"
            : "Convert"
          : zh
            ? `批量提交 ${drafts.length} 个任务`
            : `Submit ${drafts.length} tasks`
      }
      onSubmit={() =>
        mode === "structure"
          ? run.submit({
              operation: "json",
              name: zh ? "结构转输入" : "Structure conversion",
              assets: structures.length ? structures : [structure],
              altloc,
              assembly_id: assembly || null,
              include_discont_poly_poly_bonds: bonds,
            })
          : batch()
      }
      steps={[
        {
          title: zh ? "选择方式" : "Choose source",
          content: goal,
          valid: true,
        },
        {
          title: zh ? "提供文件" : "Provide files",
          content: inputs,
          valid: inputValid,
        },
        {
          title: zh ? "审阅参数" : "Review settings",
          content: settings,
          valid: inputValid,
        },
        {
          title: zh ? "确认启动" : "Review & start",
          content: review,
          valid: inputValid && (mode === "structure" || reviewed),
        },
      ]}
    />
  );
}
