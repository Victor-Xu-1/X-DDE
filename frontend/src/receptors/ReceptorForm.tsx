import { useRef, useState } from "react";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import {
  ReceptorInputs,
  emptyReceptorSelection as blank,
  type ReceptorRow as Row,
} from "./ReceptorInputs";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import type { Job, Language } from "../types";
import { defaults } from "./generated";
import "./receptors.css";

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
    [error, setError] = useState(""),
    [raw, setRaw] = useState(JSON.stringify(defaults, null, 2));
  const { ready, error: readinessError } =
    useTaskReadiness("biopython.ensemble");
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
  async function submit() {
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
      return await run.submit({
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
  const inputs = (
    <ReceptorInputs
      language={language}
      rows={rows}
      expert={expert}
      update={update}
      onRemove={(key) => {
        setRows((v) => v.filter((r) => r.key !== key));
        setReference(0);
      }}
      onAdd={() => setRows((v) => [...v, newRow(serial.current++)])}
    />
  );
  const purpose = (
    <>
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
    </>
  );
  const settings = (
    <>
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
    </>
  );
  const valid = rows.every((r) => Boolean(r.structure));
  const summary = (
    <dl className="questionnaire-review">
      <dt>{zh ? "已有结构" : "Existing structures"}</dt>
      <dd>
        {zh
          ? `${rows.length} 个具体结构版本`
          : `${rows.length} exact structural versions`}
      </dd>
      <dt>{zh ? "对齐参照" : "Alignment reference"}</dt>
      <dd>{zh ? `受体 ${reference + 1}` : `Receptor ${reference + 1}`}</dd>
      <dt>{zh ? "比较方式" : "Comparison"}</dt>
      <dd>
        {choice === "same"
          ? zh
            ? "同靶标，保守对齐"
            : "Same target, conservative alignment"
          : choice === "similar"
            ? zh
              ? "允许少量序列差异"
              : "Allow small sequence differences"
            : zh
              ? "几何比较，允许不完整骨架"
              : "Geometry comparison; allow incomplete backbone"}
      </dd>
      <dt>{zh ? "参数模式" : "Parameter mode"}</dt>
      <dd>
        {expert
          ? zh
            ? "专家微调"
            : "Expert settings"
          : zh
            ? "推荐参数"
            : "Recommended settings"}
      </dd>
      <dt>{zh ? "任务名称" : "Task name"}</dt>
      <dd>{name.trim() || (zh ? "自动命名" : "Automatic")}</dd>
    </dl>
  );
  return (
    <Questionnaire
      language={language}
      busy={run.busy}
      error={error || run.error || readinessError}
      ready={ready}
      unavailable={
        zh
          ? "请在安装与组件中部署受体构象环境。当前选择已保留，可稍后启动。"
          : "Install the receptor conformation environment in Installation & components. Your choices are retained for a later start."
      }
      submitLabel={
        zh ? "对齐并建立受体集合" : "Align and register receptor ensemble"
      }
      onSubmit={submit}
      steps={[
        {
          title: zh ? "选择结构" : "Choose structures",
          content: inputs,
          valid,
        },
        {
          title: zh ? "选择比较" : "Choose comparison",
          content: purpose,
          valid: true,
        },
        {
          title: zh ? "选择方案" : "Choose settings",
          content: settings,
          valid: true,
        },
        { title: zh ? "确认启动" : "Review & start", content: summary, valid },
      ]}
    />
  );
}
