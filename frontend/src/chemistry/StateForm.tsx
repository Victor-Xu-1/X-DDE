import "./states.css";
import { useState } from "react";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { Hint } from "../guided/Hint";
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
    [error, setError] = useState("");
  const { ready, error: readinessError } = useTaskReadiness("chemistry.states");
  async function submit() {
    setError("");
    try {
      const selected = expert ? JSON.parse(raw) : options;
      if (!molecule)
        throw new Error(
          zh ? "请选择分子版本。" : "Choose a molecular version.",
        );
      return await run.submit({
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
  const input = (
    <>
      {" "}
      <ReferencePicker
        kind="ligand"
        value={molecule}
        onChange={setMolecule}
        language={language}
        label={zh ? "选择 SDF 分子版本" : "Choose an SDF molecular version"}
      />
    </>
  );
  const purpose = (
    <>
      {" "}
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
    </>
  );
  const settings = (
    <>
      <div className="field">
        <span>
          {zh ? "采用推荐参数" : "Use recommended settings"}{" "}
          <Hint label={zh ? "准备方案说明" : "Preparation settings help"}>
            {zh
              ? "简易模式自动设置状态数量、pH 范围和三维构象数量。需要指定力场、枚举上限或资源时再打开专家微调。"
              : "Guided mode sets the state limit, pH range and conformer count. Open expert settings only to change force fields, enumeration limits or resources."}
          </Hint>
        </span>
      </div>
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
    </>
  );
  const summary = (
    <dl className="questionnaire-review">
      <dt>{zh ? "分子材料" : "Molecular input"}</dt>
      <dd>
        {molecule
          ? zh
            ? `已选择具体版本，记录 ${molecule.record + 1}`
            : `Exact version selected, record ${molecule.record + 1}`
          : "—"}
      </dd>
      <dt>{zh ? "准备方案" : "Preparation plan"}</dt>
      <dd>
        {choice === "supplied"
          ? zh
            ? "保留当前状态，生成构象"
            : "Keep supplied state; generate conformers"
          : choice === "physiological"
            ? zh
              ? "近生理 pH 状态与构象"
              : "States and conformers near physiological pH"
            : zh
              ? "扩大 pH 范围探索"
              : "Explore a wider pH range"}
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
          ? "请在安装与组件中部署化学准备环境。当前选择已保留，可稍后启动。"
          : "Install the Chemistry preparation environment in Installation & components. Your choices are retained for a later start."
      }
      submitLabel={zh ? "准备状态与构象" : "Prepare states and conformers"}
      onSubmit={submit}
      steps={[
        {
          title: zh ? "选择分子" : "Choose molecule",
          content: input,
          valid: Boolean(molecule),
        },
        {
          title: zh ? "选择用途" : "Choose purpose",
          content: purpose,
          valid: true,
        },
        {
          title: zh ? "选择方案" : "Choose settings",
          content: settings,
          valid: true,
        },
        {
          title: zh ? "确认启动" : "Review & start",
          content: summary,
          valid: Boolean(molecule),
        },
      ]}
    />
  );
}
