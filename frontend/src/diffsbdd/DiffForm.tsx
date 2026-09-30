import { useState } from "react";
import { request } from "../api";
import { useEffect } from "react";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { ReferencePicker } from "./ReferencePicker";
import { PocketPicker } from "./PocketPicker";
import { FixedAtomPicker } from "./FixedAtomPicker";
import { DesignOptions } from "./DesignOptions";
import { designPayload, optionsFor, referenceKey } from "./model";
import { isDesign, type DiffMode, type Pocket } from "./types";
import { defaults } from "./generated";
import "./diffsbdd.css";

export function DiffForm({
  mode,
  language,
  onCreated,
  initialProtein = null,
  initialMolecule = null,
}: {
  mode: DiffMode;
  language: Language;
  onCreated(job: Job): void;
  initialProtein?: MoleculeRef | null;
  initialMolecule?: MoleculeRef | null;
}) {
  const zh = language === "zh",
    run = useTaskSubmit(onCreated);
  const [protein, setProtein] = useState<MoleculeRef | null>(initialProtein),
    [molecule, setMolecule] = useState<MoleculeRef | null>(initialMolecule);
  const [pocket, setPocket] = useState<Pocket | null>(null),
    [fixed, setFixed] = useState<number[]>([]);
  const [savedRegions, setSavedRegions] = useState<string | null>(null);
  const [expert, setExpert] = useState(false),
    [options, setOptions] = useState<Record<string, unknown>>(() =>
      isDesign(mode) ? optionsFor(mode) : structuredClone(defaults),
    );
  const [collection, setCollection] = useState<MoleculeRef[]>(
      initialMolecule ? [initialMolecule] : [],
    ),
    [name, setName] = useState("");
  const [checks, setChecks] = useState<{
      configuration_present: boolean;
      missing: string[];
    } | null>(null),
    [error, setError] = useState("");
  const [chains, setChains] = useState(""),
    [removeWater, setRemoveWater] = useState(true),
    [keepLigands, setKeepLigands] = useState(true),
    [removeH, setRemoveH] = useState(false);
  const needsProtein =
    isDesign(mode) || ["pocket", "prepare", "interactions"].includes(mode);
  const needsMolecule =
    mode === "interactions" || (isDesign(mode) && mode !== "generate");
  const collectionMode = mode === "properties" || mode === "export";
  useEffect(() => {
    const c = new AbortController();
    void request<{ availability: typeof checks }>(
      `/capabilities/diffsbdd.${mode}`,
      { signal: c.signal },
    )
      .then((data) => {
        if (!c.signal.aborted) setChecks(data.availability);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [mode]);
  function selectProtein(ref: MoleculeRef | null) {
    setProtein(ref);
    setPocket(null);
  }
  function selectMolecule(ref: MoleculeRef | null) {
    setMolecule(ref);
    setFixed([]);
    setSavedRegions(null);
  }
  async function submit() {
    setError("");
    try {
      let payload: Record<string, unknown> & { mode: DiffMode };
      if (isDesign(mode)) {
        if (!protein || !pocket)
          throw new Error(
            zh ? "请选择受体和口袋。" : "Choose a receptor and a pocket.",
          );
        payload = designPayload(
          mode,
          protein,
          pocket,
          molecule,
          options,
          fixed,
          savedRegions,
        );
      } else if (mode === "pocket") {
        if (!protein || !pocket)
          throw new Error(
            zh ? "请选择受体和口袋。" : "Choose a receptor and a pocket.",
          );
        payload = { mode, protein, pocket };
      } else if (mode === "prepare") {
        if (!protein)
          throw new Error(zh ? "请选择受体。" : "Choose a receptor.");
        payload = {
          mode,
          protein,
          chains: chains.split(/[\s,，]+/).filter(Boolean),
          remove_water: removeWater,
          keep_ligands: keepLigands,
          remove_hydrogens: removeH,
        };
      } else if (mode === "interactions") {
        if (!protein || !molecule)
          throw new Error(
            zh
              ? "请选择受体与已对齐的分子。"
              : "Choose a receptor and aligned molecule.",
          );
        payload = { mode, protein, molecule };
      } else {
        if (!collection.length)
          throw new Error(
            zh ? "请添加至少一个候选。" : "Add at least one candidate.",
          );
        payload = { mode, molecules: collection };
      }
      await run.submit({
        operation: "diffsbdd",
        name: name.trim() || `DiffSBDD · ${mode}`,
        payload,
      });
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <form
      className="tool-form diff-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset disabled={run.busy}>
        <p className="notice">
          {zh
            ? "按步骤选择输入，参数已提供默认值。输入和输出都进入 X-DDE 共享资产体系，保留来源和版本。"
            : "Choose inputs step by step using the supplied defaults. Inputs and outputs share X-DDE assets with provenance and versions."}
        </p>
        <div className="segmented">
          <button
            type="button"
            aria-pressed={!expert}
            onClick={() => setExpert(false)}
          >
            {zh ? "简易模式" : "Guided mode"}
          </button>
          <button
            type="button"
            aria-pressed={expert}
            onClick={() => setExpert(true)}
          >
            {zh ? "专家微调" : "Expert mode"}
          </button>
        </div>
        {!checks && !error && (
          <p role="status">
            {zh ? "检查服务器配置…" : "Checking server configuration…"}
          </p>
        )}
        {checks && !checks.configuration_present && (
          <p className="notice">
            {zh
              ? "后端环境尚未就绪，可先准备输入；请在安装与组件页面部署 DiffSBDD。"
              : "The environment is not ready. Prepare inputs now and install DiffSBDD in Installation & components."}
          </p>
        )}
        {needsProtein && (
          <ReferencePicker
            kind="structure"
            value={protein}
            onChange={selectProtein}
            language={language}
            label={zh ? "1. 选择 PDB 受体" : "1. Choose PDB receptor"}
          />
        )}
        {(isDesign(mode) || mode === "pocket") && protein && (
          <PocketPicker
            key={referenceKey(protein)}
            protein={protein}
            value={pocket}
            onChange={setPocket}
            language={language}
          />
        )}
        {needsMolecule && (
          <ReferencePicker
            kind="ligand"
            value={molecule}
            onChange={selectMolecule}
            language={language}
            label={
              zh
                ? "选择与受体对齐的三维 SDF 分子"
                : "Choose a 3D SDF molecule aligned with the receptor"
            }
          />
        )}
        {mode === "inpaint" && molecule && (
          <FixedAtomPicker
            key={referenceKey(molecule)}
            initial={molecule}
            fixed={fixed}
            onChange={(values) => {
              setFixed(values);
              setSavedRegions(null);
            }}
            onSaved={setSavedRegions}
            language={language}
          />
        )}
        {isDesign(mode) && (
          <DesignOptions
            mode={mode}
            value={options}
            onChange={setOptions}
            expert={expert}
            language={language}
          />
        )}
        {mode === "prepare" && (
          <>
            <label className="field">
              {zh
                ? "保留哪些链？留空保留全部"
                : "Which chains should remain? Leave blank for all"}
              <input
                value={chains}
                onChange={(e) => setChains(e.target.value)}
                maxLength={200}
                placeholder="A, B"
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={removeWater}
                onChange={(e) => setRemoveWater(e.target.checked)}
              />
              {zh ? "移除水" : "Remove water"}
            </label>
            <label>
              <input
                type="checkbox"
                checked={keepLigands}
                onChange={(e) => setKeepLigands(e.target.checked)}
              />
              {zh ? "保留结构中的配体" : "Keep bound ligands"}
            </label>
            <label>
              <input
                type="checkbox"
                checked={removeH}
                onChange={(e) => setRemoveH(e.target.checked)}
              />
              {zh ? "移除已有氢原子" : "Remove existing hydrogens"}
            </label>
            <p className="field-help">
              {zh
                ? "此步骤筛选结构内容并保留坐标，不负责修复缺失原子、加氢或优化蛋白。"
                : "This filters structure content while preserving coordinates. It does not repair missing atoms, add hydrogens or optimize proteins."}
            </p>
          </>
        )}
        {collectionMode && (
          <>
            <ReferencePicker
              kind="ligand"
              value={molecule}
              onChange={selectMolecule}
              language={language}
              label={zh ? "添加分子候选" : "Add molecular candidates"}
            />
            <button
              type="button"
              disabled={
                !molecule ||
                collection.length >= 100 ||
                collection.some(
                  (ref) => referenceKey(ref) === referenceKey(molecule),
                )
              }
              onClick={() => {
                if (molecule) setCollection([...collection, molecule]);
              }}
            >
              {zh ? "加入候选集合" : "Add to collection"}
            </button>
            <ul>
              {collection.map((ref, i) => (
                <li key={referenceKey(ref)}>
                  {i + 1} · {ref.asset_id.slice(0, 8)} ·{" "}
                  {zh ? "记录" : "Record"} {ref.record + 1}{" "}
                  <button
                    type="button"
                    onClick={() =>
                      setCollection(collection.filter((_, n) => n !== i))
                    }
                  >
                    {zh ? "移除" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <label className="field">
          {zh ? "任务名称（可选）" : "Task name (optional)"}
          <input
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p className="field-help">
          {zh
            ? "生成与优化结果是计算候选，QED/SA 是描述符；不代表经过校准的亲和力、ADMET 或实验药效。科学执行仍需目标服务器验收。"
            : "Generated and optimized molecules are computational candidates. QED/SA are descriptors, not calibrated affinity, ADMET or experimental efficacy. Scientific execution requires target-server acceptance."}
        </p>
        {(error || run.error) && (
          <p role="alert" className="error-box">
            {error || run.error}
          </p>
        )}
        <button
          className="primary-button"
          disabled={
            run.busy ||
            !checks?.configuration_present ||
            (needsProtein && !protein) ||
            (needsMolecule && !molecule) ||
            ((isDesign(mode) || mode === "pocket") && !pocket) ||
            (mode === "inpaint" && !fixed.length) ||
            (collectionMode && !collection.length)
          }
        >
          {run.busy
            ? zh
              ? "正在提交…"
              : "Submitting…"
            : zh
              ? "创建任务"
              : "Create task"}
        </button>
      </fieldset>
    </form>
  );
}
