import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Job, Language, Prediction } from "../types";
import { AssetPicker } from "./AssetPicker";
import { useTaskSubmit } from "./useTaskSubmit";

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
  const zh = language === "zh",
    [structure, setStructure] = useState(""),
    [structures, setStructures] = useState<string[]>([]),
    [config, setConfig] = useState(""),
    [altloc, setAltloc] = useState("first"),
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
  useEffect(() => {
    const c = new AbortController();
    setArtifacts([]);
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
      onCreated(created[0]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="tool-form">
      <section>
        <h3>
          {zh
            ? "1 · 结构文件转 OpenDDE 输入"
            : "1 · Convert structures to OpenDDE input"}
        </h3>
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
        <button
          className="primary-button"
          disabled={run.busy || (!structure && !structures.length)}
          onClick={() =>
            void run.submit({
              operation: "json",
              name: zh ? "结构转输入" : "Structure conversion",
              assets: structures.length ? structures : [structure],
              altloc,
              assembly_id: assembly || null,
              include_discont_poly_poly_bonds: bonds,
            })
          }
        >
          {zh ? "开始转换" : "Convert"}
        </button>
      </section>
      <section>
        <h3>
          {zh ? "2 · 导入并审阅预测任务" : "2 · Import and review predictions"}
        </h3>
        <AssetPicker
          kind="config"
          value={config}
          onChange={setConfig}
          language={language}
          label={
            zh ? "已有的原生 OpenDDE JSON" : "Existing native OpenDDE JSON"
          }
        />
        <button
          disabled={busy || !config}
          onClick={() => void load(`/assets/${config}/import`)}
        >
          {zh ? "导入文件" : "Import file"}
        </button>
        <p>
          {zh
            ? "或复用本工作台已完成的转换 / 特征准备结果："
            : "Or reuse completed conversion / feature preparation outputs:"}
        </p>
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
            onChange={(e) => setArtifact(e.target.value)}
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
          disabled={busy || !source || !artifact}
          onClick={() =>
            void load(
              `/jobs/${source}/import?${new URLSearchParams({ name: artifact })}`,
            )
          }
        >
          {zh ? "复用结果" : "Reuse result"}
        </button>
        {drafts.length > 0 && (
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
                <button onClick={() => onDraft(d)}>
                  {zh ? "编辑并预测" : "Edit and predict"}
                </button>
                <button
                  onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}
                >
                  {zh ? "移出批次" : "Remove"}
                </button>
              </div>
            ))}
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void batch()}
            >
              {zh
                ? `批量提交 ${drafts.length} 个任务`
                : `Submit ${drafts.length} tasks`}
            </button>
          </>
        )}
      </section>
      {(error || run.error) && (
        <p role="alert" className="error-box">
          {error || run.error}
        </p>
      )}
    </div>
  );
}
