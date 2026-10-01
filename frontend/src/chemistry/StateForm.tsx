import "./states.css";
import { useEffect, useState } from "react";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { request } from "../api";
import { optionsFor, type PreparationChoice } from "./model";
import type { StateOptions } from "./types";

export function StateForm({
  language,
  onCreated,
  initialMolecule = null,
}: {
  language: Language;
  onCreated(job: Job): void;
  initialMolecule?: MoleculeRef | null;
}) {
  const zh = language === "zh",
    run = useTaskSubmit(onCreated);
  const [molecule, setMolecule] = useState<MoleculeRef | null>(initialMolecule),
    [choice, setChoice] = useState<PreparationChoice>("supplied"),
    [options, setOptions] = useState<StateOptions>(() =>
      optionsFor("supplied"),
    );
  const [expert, setExpert] = useState(false),
    [raw, setRaw] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    void request<{ availability: { configuration_present: boolean } }>(
      "/capabilities/chemistry.states",
      { signal: c.signal },
    )
      .then((v) => {
        if (!c.signal.aborted) setReady(v.availability.configuration_present);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const selected = expert ? JSON.parse(raw) : options;
      if (!molecule)
        throw new Error(
          zh ? "请选择分子版本。" : "Choose a molecular version.",
        );
      await run.submit({
        operation: "molecular_states",
        name:
          name.trim() ||
          (zh ? "分子状态与构象准备" : "Molecular states and conformers"),
        molecule,
        options: selected,
      });
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <form className="molecular-state-form" onSubmit={(e) => void submit(e)}>
      <ReferencePicker
        kind="ligand"
        value={molecule}
        onChange={setMolecule}
        language={language}
        label={zh ? "选择 SDF 分子版本" : "Choose an SDF molecular version"}
      />
      <label className="field">
        {zh ? "这次准备什么？" : "What should be prepared?"}
        <select
          value={choice}
          onChange={(e) => {
            const v = e.target.value as PreparationChoice;
            setChoice(v);
            setOptions(optionsFor(v));
            setRaw(JSON.stringify(optionsFor(v), null, 2));
          }}
        >
          <option value="supplied">
            {zh
              ? "保留当前化学状态，生成三维构象（推荐）"
              : "Keep the supplied state; generate 3D conformers (recommended)"}
          </option>
          <option value="physiological">
            {zh
              ? "探索近生理 pH 的化学状态与构象"
              : "Explore states and conformers near physiological pH"}
          </option>
          <option value="explore">
            {zh
              ? "扩大 pH 范围，探索更多状态"
              : "Explore more states across a wider pH range"}
          </option>
        </select>
      </label>
      <p
        className="field-help"
        title={
          zh
            ? "按规则枚举不是实测 pKa 或状态占比。新构象使用新的游离坐标系，不能直接当作与受体对齐的结合姿势。"
            : "Rule enumeration is not measured pKa or state populations. New conformers have a free coordinate frame and are not receptor-aligned binding poses."
        }
      >
        {zh
          ? "新构象用于后续搜索；已有区域和空间条件需在新版本上复核。"
          : "Use new conformers for subsequent searches; review existing regions and spatial conditions on the new versions."}
      </p>
      <button
        type="button"
        className="secondary-button"
        aria-pressed={expert}
        onClick={() => {
          if (!expert) setRaw(JSON.stringify(options, null, 2));
          setExpert(!expert);
        }}
      >
        {expert
          ? zh
            ? "返回简易模式"
            : "Return to guided mode"
          : zh
            ? "专家微调"
            : "Expert settings"}
      </button>
      {expert && (
        <label className="field">
          {zh
            ? "全部准备参数（服务端校验）"
            : "All preparation parameters (server validated)"}
          <textarea
            rows={16}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </label>
      )}
      <label className="field">
        {zh ? "任务名称（可选）" : "Task name (optional)"}
        <input
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {!ready && (
        <p className="notice">
          {zh
            ? "请在安装与组件中部署独立的化学准备环境；无需生成模型权重。"
            : "Install the independent Chemistry preparation environment in Installation & components. No generative-model weights are needed."}
        </p>
      )}
      {(error || run.error) && (
        <p role="alert" className="error-box">
          {error || run.error}
        </p>
      )}
      <button
        className="primary-button"
        disabled={!ready || !molecule || run.busy}
      >
        {run.busy
          ? zh
            ? "提交中…"
            : "Submitting…"
          : zh
            ? "准备状态与构象"
            : "Prepare states and conformers"}
      </button>
    </form>
  );
}
