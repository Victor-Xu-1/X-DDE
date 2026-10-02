import { ConstraintPanel } from "../constraints/ConstraintPanel";
import { useExampleReference, useExampleTask } from "../examples/context";
import { withConstraints } from "../constraints/model";
import type { ConstraintReference } from "../constraints/types";
import { useState } from "react";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { DiffInputQuestions, DiffSettingQuestions } from "./DiffQuestions";
import { PocketPicker } from "./PocketPicker";
import { FixedAtomPicker } from "./FixedAtomPicker";
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
  initialPocket = null,
}: {
  mode: DiffMode;
  language: Language;
  onCreated(job: Job): void;
  initialProtein?: MoleculeRef | null;
  initialMolecule?: MoleculeRef | null;
  initialPocket?: Pocket | null;
}) {
  const exampleTask = useExampleTask("diffsbdd");
  const preset =
    exampleTask?.payload.mode === mode ? exampleTask.payload : null;
  const exampleProtein = useExampleReference("receptor", "brd4");
  const exampleMolecule = useExampleReference("jq1");
  initialProtein ??=
    (preset?.protein as MoleculeRef | undefined) ?? exampleProtein;
  initialMolecule ??=
    ((preset?.initial ?? preset?.molecule) as MoleculeRef | undefined) ??
    exampleMolecule;
  initialPocket ??=
    (preset?.pocket as Pocket | undefined) ??
    (exampleMolecule ? { kind: "ligand", ligand: exampleMolecule } : null);
  const zh = language === "zh",
    run = useTaskSubmit(onCreated);
  const [protein, setProtein] = useState<MoleculeRef | null>(initialProtein),
    [molecule, setMolecule] = useState<MoleculeRef | null>(initialMolecule);
  const [pocket, setPocket] = useState<Pocket | null>(initialPocket),
    [fixed, setFixed] = useState<number[]>(
      (preset?.options as { fixed_atoms?: number[] } | undefined)
        ?.fixed_atoms ?? [],
    );
  const [constraints, setConstraints] = useState<ConstraintReference | null>(
    null,
  );
  const [savedRegions, setSavedRegions] = useState<string | null>(null);
  const [expert, setExpert] = useState(false),
    [options, setOptions] = useState<Record<string, unknown>>(() =>
      isDesign(mode)
        ? structuredClone(
            (preset?.options as Record<string, unknown>) ?? optionsFor(mode),
          )
        : structuredClone(defaults),
    );
  const [collection, setCollection] = useState<MoleculeRef[]>(
      (preset?.molecules as MoleculeRef[]) ??
        (initialMolecule ? [initialMolecule] : []),
    ),
    [name, setName] = useState("");
  const [error, setError] = useState("");
  const { ready, error: readinessError } = useTaskReadiness(`diffsbdd.${mode}`);
  const [chains, setChains] = useState(
      (preset?.chains as string[] | undefined)?.join(", ") ?? "",
    ),
    [removeWater, setRemoveWater] = useState(
      Boolean(preset?.remove_water ?? true),
    ),
    [keepLigands, setKeepLigands] = useState(
      Boolean(preset?.keep_ligands ?? true),
    ),
    [removeH, setRemoveH] = useState(
      Boolean(preset?.remove_hydrogens ?? false),
    );
  const needsProtein =
    isDesign(mode) || ["pocket", "prepare", "interactions"].includes(mode);
  const needsMolecule =
    mode === "interactions" || (isDesign(mode) && mode !== "generate");
  const collectionMode = mode === "properties" || mode === "export";
  function selectProtein(ref: MoleculeRef | null) {
    setProtein(ref);
    setPocket(null);
  }
  function selectMolecule(ref: MoleculeRef | null) {
    setMolecule(ref);
    setFixed([]);
    setSavedRegions(null);
    setConstraints(null);
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
      return await run.submit(
        await withConstraints(
          {
            operation: "diffsbdd",
            name: name.trim() || `DiffSBDD · ${mode}`,
            payload,
          },
          constraints,
          language,
        ),
      );
    } catch (e) {
      setError(String(e));
    }
  }
  const inputs = (
    <DiffInputQuestions
      language={language}
      needsProtein={needsProtein}
      needsMolecule={needsMolecule}
      collectionMode={collectionMode}
      protein={protein}
      molecule={molecule}
      collection={collection}
      selectProtein={selectProtein}
      selectMolecule={selectMolecule}
      setCollection={setCollection}
    />
  );
  const selections = (
    <>
      {" "}
      {(isDesign(mode) || mode === "pocket") && protein && (
        <PocketPicker
          key={referenceKey(protein)}
          protein={protein}
          value={pocket}
          onChange={setPocket}
          language={language}
        />
      )}
      {mode === "inpaint" && (
        <p
          className="field-help"
          title={
            zh
              ? "生成后逐个核对原子身份、内部连接与坐标；立体定义跨出固定区域时，请一并选择定义该立体化学的邻居原子。原生容差为 0.5 Å。"
              : "After generation, check atom identity, internal bonds and coordinates independently. Include stereo-defining neighbours when they cross the core boundary. Native tolerance is 0.5 Å."
          }
        >
          {zh
            ? "固定区域会独立复核；违反要求或无法确认的候选不会自动复用。"
            : "Fixed cores are independently checked; failed or uncertain candidates are not reused automatically."}
        </p>
      )}
      {mode === "inpaint" && molecule && (
        <FixedAtomPicker
          key={`fixed:${referenceKey(molecule)}`}
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
      {mode === "inpaint" && molecule && (
        <ConstraintPanel
          key={`constraints:${referenceKey(molecule)}`}
          subject={molecule}
          language={language}
          value={constraints}
          onChange={setConstraints}
          getTask={() => {
            if (!protein || !pocket)
              throw new Error(
                zh ? "请选择受体和口袋" : "Choose a receptor and pocket",
              );
            return {
              operation: "diffsbdd",
              name: name.trim() || "Inpainting",
              payload: designPayload(
                "inpaint",
                protein,
                pocket,
                molecule,
                options,
                fixed,
                savedRegions,
              ),
            };
          }}
          onApply={(doc, regions) => {
            const indices = new Set<number>();
            for (const condition of doc.conditions) {
              if (
                condition.kind !== "fixed_region" ||
                condition.scope !== "subject"
              )
                throw new Error(
                  zh
                    ? "此任务仅支持分子固定核心"
                    : "This task supports fixed molecular cores only",
                );
              const region = regions
                .find((r) => r.id === condition.region_id)
                ?.body.regions.find((r) => r.name === condition.region_name);
              if (!region)
                throw new Error(
                  zh ? "无法读取保存选区" : "Saved selection is unavailable",
                );
              region.atom_indices.forEach((i) => indices.add(i));
            }
            if (indices.size > 80)
              throw new Error(
                zh ? "原生固定原子上限为 80" : "Native fixed atom limit is 80",
              );
            setFixed([...indices].sort((a, b) => a - b));
            setSavedRegions(null);
          }}
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
      {!needsProtein && (
        <p className="field-help">
          {zh
            ? `将使用已选 ${collection.length} 个具体分子记录。`
            : `Use the ${collection.length} selected molecular records.`}
        </p>
      )}
    </>
  );
  const settings = (
    <DiffSettingQuestions
      mode={mode}
      language={language}
      expert={expert}
      setExpert={setExpert}
      options={options}
      setOptions={setOptions}
      name={name}
      setName={setName}
    />
  );
  const inputValid =
    (!needsProtein || Boolean(protein)) &&
    (!needsMolecule || Boolean(molecule)) &&
    (!collectionMode || collection.length > 0);
  const selectionValid =
    (!(isDesign(mode) || mode === "pocket") || Boolean(pocket)) &&
    (mode !== "inpaint" || fixed.length > 0);
  const names: Record<DiffMode, [string, string]> = {
    generate: ["口袋条件分子生成", "Pocket-conditioned generation"],
    inpaint: ["局部重设计", "Local redesign"],
    diversify: ["分子多样化", "Molecular diversification"],
    optimize: ["分子优化", "Molecular optimization"],
    pocket: ["口袋检查", "Pocket inspection"],
    prepare: ["受体准备", "Receptor preparation"],
    interactions: ["相互作用分析", "Interaction analysis"],
    properties: ["候选性质", "Candidate properties"],
    export: ["候选导出", "Candidate export"],
  };
  const review = (
    <dl className="questionnaire-review">
      <dt>{zh ? "任务" : "Task"}</dt>
      <dd>{names[mode][zh ? 0 : 1]}</dd>
      <dt>{zh ? "研究材料" : "Research inputs"}</dt>
      <dd>
        {zh
          ? "沿用已选文件、记录和版本"
          : "Use the selected files, records and versions"}
      </dd>
      <dt>{zh ? "参数模式" : "Parameter mode"}</dt>
      <dd>
        {expert
          ? zh
            ? "专家微调"
            : "Expert settings"
          : zh
            ? "推荐方案"
            : "Recommended settings"}
      </dd>
      <dt>{zh ? "任务名称" : "Task name"}</dt>
      <dd>{name.trim() || names[mode][zh ? 0 : 1]}</dd>
    </dl>
  );
  return (
    <Questionnaire
      language={language}
      ready={ready}
      busy={run.busy}
      error={error || run.error || readinessError}
      unavailable={
        zh
          ? "本任务所需的 DiffSBDD 环境尚未配置。请到安装与组件部署；当前输入保留。"
          : "Configure the required DiffSBDD environment in Installation & components. Inputs are retained."
      }
      submitLabel={zh ? "创建任务" : "Create task"}
      onSubmit={submit}
      steps={[
        {
          title: zh ? "选择材料" : "Choose inputs",
          content: inputs,
          valid: inputValid,
        },
        {
          title: zh ? "选择范围" : "Choose scope",
          content: selections,
          valid: selectionValid,
        },
        {
          title: zh ? "选择方案" : "Choose settings",
          content: settings,
          valid: true,
        },
        {
          title: zh ? "确认启动" : "Review & start",
          content: review,
          valid: inputValid && selectionValid,
        },
      ]}
    />
  );
}
