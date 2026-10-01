import { useEffect, useRef, useState } from "react";
import { request } from "../api";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
import { defaults } from "./generated";
import type { Selection } from "./types";
import "./receptors.css";

const blank = (): Selection => ({
  model_index: 0,
  chains: [],
  profile: "unspecified",
  chain_pairs: [],
  residue_pairs: [],
});
interface Row {
  key: number;
  structure: MoleculeRef | null;
  selection: Selection;
  raw: string;
}
const newRow = (key: number): Row => ({
  key,
  structure: null,
  selection: blank(),
  raw: JSON.stringify(blank(), null, 2),
});
export function ReceptorForm({
  language,
  onCreated,
}: {
  language: Language;
  onCreated(job: Job): void;
}) {
  const zh = language === "zh",
    run = useTaskSubmit(onCreated),
    serial = useRef(2);
  const [rows, setRows] = useState<Row[]>(() => [newRow(0), newRow(1)]),
    [reference, setReference] = useState(0),
    [choice, setChoice] = useState("same"),
    [expert, setExpert] = useState(false),
    [name, setName] = useState(""),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [raw, setRaw] = useState(JSON.stringify(defaults, null, 2));
  useEffect(() => {
    const c = new AbortController();
    void request<{ availability: { configuration_present: boolean } }>(
      "/capabilities/biopython.ensemble",
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
  function options(value = choice) {
    return {
      ...defaults,
      reference_index: reference,
      minimum_identity: value === "similar" ? 0.95 : 1,
      maximum_rmsd_angstrom: value === "similar" ? 5 : 3,
      require_complete_backbone: value !== "geometry",
    };
  }
  function update(key: number, change: Partial<Row>) {
    setRows((v) =>
      v.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (rows.some((r) => !r.structure))
        throw new Error(
          zh
            ? "请选择每个受体的具体结构版本。"
            : "Choose an exact structural version for each member.",
        );
      const selected = expert ? JSON.parse(raw) : options();
      selected.reference_index = reference;
      await run.submit({
        operation: "receptor_ensemble",
        name:
          name.trim() ||
          (zh ? "受体构象集合" : "Receptor conformation ensemble"),
        inputs: rows.map((row) => ({
          structure: row.structure!,
          selection: expert ? JSON.parse(row.raw) : row.selection,
        })),
        options: selected,
      });
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <form className="receptor-form" onSubmit={(e) => void submit(e)}>
      <fieldset disabled={run.busy}>
        {rows.map((row, index) => (
          <section
            className="receptor-input"
            key={row.key}
            aria-label={zh ? `受体 ${index + 1}` : `Receptor ${index + 1}`}
          >
            <div className="receptor-row-heading">
              <strong>
                {zh ? "受体" : "Receptor"} {index + 1}
              </strong>
              <button
                className="secondary-button"
                type="button"
                disabled={rows.length <= 2}
                onClick={() => {
                  setRows((v) => v.filter((r) => r.key !== row.key));
                  setReference(0);
                }}
              >
                {zh ? "移除此结构" : "Remove structure"}
              </button>
            </div>
            <ReferencePicker
              kind="structure"
              allowedSuffixes={[".pdb", ".cif"]}
              value={row.structure}
              onChange={(structure) =>
                update(row.key, {
                  structure,
                  selection: blank(),
                  raw: JSON.stringify(blank(), null, 2),
                })
              }
              language={language}
              label={
                zh
                  ? `受体 ${index + 1} 结构版本`
                  : `Receptor ${index + 1} structural version`
              }
            />
            <label className="field">
              {zh ? "结构来源" : "Structure source"}
              <select
                value={row.selection.profile}
                onChange={(e) => {
                  const selection = {
                    ...row.selection,
                    profile: e.target.value as Selection["profile"],
                  };
                  update(row.key, {
                    selection,
                    raw: JSON.stringify(selection, null, 2),
                  });
                }}
              >
                <option value="unspecified">
                  {zh ? "来源未声明" : "Source not declared"}
                </option>
                <option value="experimental">
                  {zh ? "实验结构" : "Experimental structure"}
                </option>
                <option value="predicted">
                  {zh ? "预测结构" : "Predicted structure"}
                </option>
              </select>
            </label>
            {expert && (
              <label className="field">
                {zh
                  ? `受体 ${index + 1} 的模型、链与对应参数`
                  : `Model, chain and correspondence settings for receptor ${index + 1}`}
                <textarea
                  rows={8}
                  value={row.raw}
                  onChange={(e) => update(row.key, { raw: e.target.value })}
                />
              </label>
            )}
          </section>
        ))}
        <button
          className="secondary-button"
          type="button"
          disabled={rows.length >= 16}
          onClick={() => setRows((v) => [...v, newRow(serial.current++)])}
        >
          {zh ? "添加一个受体结构" : "Add receptor structure"}
        </button>
        <label className="field">
          {zh
            ? "哪个结构作为对齐参照？"
            : "Which structure is the alignment reference?"}
          <select
            value={reference}
            onChange={(e) => setReference(Number(e.target.value))}
          >
            {rows.map((row, i) => (
              <option value={i} key={row.key}>
                {zh ? "受体" : "Receptor"} {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {zh ? "这次如何比较？" : "How should these structures be compared?"}
          <select
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value);
              setRaw(JSON.stringify(options(e.target.value), null, 2));
            }}
          >
            <option value="same">
              {zh
                ? "同靶标构象，保守对齐（推荐）"
                : "Same target conformations, conservative alignment (recommended)"}
            </option>
            <option value="similar">
              {zh
                ? "允许少量序列差异，检查对应后比较"
                : "Allow small sequence differences; review correspondence"}
            </option>
            <option value="geometry">
              {zh
                ? "只比较几何，允许不完整骨架"
                : "Geometry comparison only; allow incomplete backbone"}
            </option>
          </select>
        </label>
        <p
          className="field-help"
          title={
            zh
              ? "按观察到的 Cα 序列匹配；同序列链或重复区域存在歧义时，需要明确链或残基对应。"
              : "Matches observed C-alpha sequences; ambiguous chains or repeated regions require explicit correspondence."
          }
        >
          {zh
            ? "对齐已有结构，不生成新构象。原结构保留；旧空间条件需在新版本上复核。"
            : "Aligns existing structures. Originals remain intact; review old spatial conditions on new versions."}
        </p>
        <button
          type="button"
          className="secondary-button"
          aria-pressed={expert}
          onClick={() => {
            if (!expert) setRaw(JSON.stringify(options(), null, 2));
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
              ? "全部对齐与资源参数（服务端校验）"
              : "Alignment and resource parameters (server validated)"}
            <textarea
              rows={12}
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
              ? "请在安装与组件中部署独立的 Biopython 受体构象环境。可以先选择输入。"
              : "Install the independent Biopython environment in Installation & components. Prepare inputs now."}
          </p>
        )}
        {(error || run.error) && (
          <p role="alert" className="error-box">
            {error || run.error}
          </p>
        )}
        <button
          className="primary-button"
          disabled={!ready || rows.some((r) => !r.structure) || run.busy}
        >
          {run.busy
            ? zh
              ? "提交中…"
              : "Submitting…"
            : zh
              ? "对齐并建立受体集合"
              : "Align and register receptor ensemble"}
        </button>
      </fieldset>
    </form>
  );
}
