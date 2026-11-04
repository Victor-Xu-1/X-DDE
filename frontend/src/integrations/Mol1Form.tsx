import { useEffect, useRef, useState } from "react";
import { request } from "../api";
import { useExampleTask } from "../examples/context";
import { validate } from "../form-model";
import { MolecularInputs } from "../guided/MolecularInputs";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import type { Asset, CovalentBond } from "../operations/types";
import type { Component, Job, Language } from "../types";
import type { ScientificTask } from "./types";
import { mol1Defaults, validMol1Settings } from "./mol1-settings";
import { Mol1Settings } from "./Mol1Settings";
import { Mol1CovalentBonds } from "./Mol1CovalentBonds";
import { Mol1FeatureInputs, validMol1Features } from "./Mol1FeatureInputs";
import { PredictionSetup } from "../presentation/PredictionSetup";
import { PredictionDraftControls } from "../presentation/PredictionDraftControls";
import {
  parseSeedText,
  snapshotMol1Settings,
  type PredictionDraft,
} from "../presentation/prediction-draft-model";

export function Mol1Form({
  language,
  onCreated,
}: {
  language: Language;
  onCreated(job: Job): void;
}) {
  const [loaded, setLoaded] = useState<PredictionDraft | null>(null);
  const [edition, setEdition] = useState(0);
  return (
    <Mol1Editor
      key={edition}
      language={language}
      onCreated={onCreated}
      initial={loaded}
      onResume={(value) => {
        setLoaded(value);
        setEdition((current) => current + 1);
      }}
    />
  );
}

function Mol1Editor({
  language,
  onCreated,
  initial,
  onResume,
}: {
  language: Language;
  onCreated(job: Job): void;
  initial: PredictionDraft | null;
  onResume(value: PredictionDraft): void;
}) {
  const zh = language === "zh";
  const preset = useExampleTask("mol1_predict");
  const [components, setComponents] = useState<Component[]>(
    () =>
      initial?.state.components ??
      (preset?.payload.components as Component[]) ?? [
        { kind: "protein", value: "", count: 1, chain_ids: ["A"] },
        { kind: "ligand", value: "", count: 1, chain_ids: ["B"] },
      ],
  );
  const [settings, setSettings] = useState(() => ({
    ...mol1Defaults(),
    ...preset?.payload,
    ...initial?.state.settings,
    additional_seeds: initial
      ? parseSeedText(initial.state.seed_text)
      : ((preset?.payload.additional_seeds as number[]) ?? []),
    kind: "mol1" as const,
  }));
  const [bonds, setBonds] = useState<CovalentBond[]>(
    () =>
      initial?.state.bonds ??
      (preset?.payload.covalent_bonds as CovalentBond[]) ??
      [],
  );
  const [advanced, setAdvanced] = useState(initial?.state.advanced ?? false);
  const [name, setName] = useState(initial?.state.name ?? preset?.name ?? "");
  const [seedText, setSeedText] = useState(
    initial?.state.seed_text ?? settings.additional_seeds.join(","),
  );
  const [device, setDevice] = useState<"cpu" | "cuda">(
    initial?.state.device ?? preset?.options.device ?? "cuda",
  );
  const [memory, setMemory] = useState(
    initial?.state.memory ?? preset?.options.memory_mib ?? 32768,
  );
  const [seed, setSeed] = useState(
    initial?.state.seed ?? preset?.options.seed ?? 101,
  );
  const [inputError, setInputError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const preparation = useRef<AbortController | null>(null);
  useEffect(() => () => preparation.current?.abort(), []);
  const availability = useTaskReadiness("mol1.predict");
  const run = useTaskSubmit(onCreated);
  const valid =
    !validate("Mol-1", components) &&
    bonds.every((bond) => bond.left.atom && bond.right.atom);
  const settingsValid =
    validMol1Settings(settings) &&
    Number.isSafeInteger(seed) &&
    seed >= 0 &&
    seed <= 2147483647 &&
    !settings.additional_seeds.includes(seed) &&
    Number.isSafeInteger(memory) &&
    memory >= 1024 &&
    memory <= 65536;
  async function submit() {
    if (preparation.current || run.busy) return;
    const controller = new AbortController();
    preparation.current = controller;
    setPreparing(true);
    setInputError("");
    try {
      const required = new Map<
        string,
        ScientificTask["inputs"][number]["role"]
      >();
      for (const component of components)
        for (const [field, role] of [
          ["ligand_file", "ligand"],
          ["source_sequence", "sequence"],
          ["paired_msa", "msa"],
          ["unpaired_msa", "msa"],
          ["template_hits", "template"],
        ] as const) {
          const id = component[field];
          if (id) required.set(id, role);
        }
      const inputs = await Promise.all(
        [...required].map(async ([id, role]) => {
          const asset = await request<Asset>(
            `/assets/${encodeURIComponent(id)}/metadata`,
            {
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(30000),
              ]),
            },
          );
          if (asset.id !== id)
            throw new Error(
              zh ? "材料版本读取失败" : "Could not verify the selected input",
            );
          return {
            role,
            source: {
              asset_id: id,
              sha256: asset.sha256,
              record: 0,
              conformer: 0,
              version_id: null,
            },
          };
        }),
      );
      if (controller.signal.aborted) return;
      return await run.submit({
        operation: "mol1_predict",
        name: name.trim() || "Mol-1 complex prediction",
        inputs,
        scientific_inputs: inputs.map((input) => input.source),
        payload: { ...settings, components, covalent_bonds: bonds },
        options: { device, cpu: 2, memory_mib: memory, seed },
      });
    } catch (error) {
      if (!controller.signal.aborted) setInputError(String(error));
    } finally {
      if (preparation.current === controller) preparation.current = null;
      setPreparing(false);
    }
  }
  const questionnaire = (
    <Questionnaire
      language={language}
      ready={availability.ready}
      busy={run.busy || preparing}
      error={inputError || run.error}
      unavailable={
        availability.error ||
        (zh
          ? "请先在安装与组件中配置 Mol-1 及其模型。"
          : "Prepare Mol-1 and its model in Installation & components.")
      }
      submitLabel={zh ? "提交 Mol-1 预测" : "Submit Mol-1 prediction"}
      onSubmit={submit}
      steps={[
        {
          title: zh ? "填写研究对象" : "Provide the study components",
          valid,
          content: (
            <>
              <MolecularInputs
                showHeading={false}
                items={components}
                onChange={(items) => {
                  setComponents(items);
                  setBonds([]);
                  setSettings((value) => ({
                    ...value,
                    use_rna_msa:
                      value.use_rna_msa &&
                      items.some((item) => item.kind === "rna"),
                    use_template:
                      value.use_template &&
                      items.some((item) => item.kind === "protein"),
                  }));
                }}
                expert={advanced}
                workflow="complex"
                features={settings.feature_mode === "uploaded"}
                language={language}
              />
              <label>
                <input
                  type="checkbox"
                  checked={advanced}
                  onChange={(e) => setAdvanced(e.target.checked)}
                />
                {zh
                  ? "更多组分、拷贝和修饰"
                  : "Additional components, copies and modifications"}
              </label>
            </>
          ),
        },
        {
          title: zh ? "提供辅助信息" : "Provide supporting information",
          valid: valid && validMol1Features(settings, components),
          content: (
            <>
              <Mol1FeatureInputs
                value={settings}
                onChange={setSettings}
                components={components}
                onComponents={setComponents}
                language={language}
              />
              <details>
                <summary>
                  {zh ? "共价连接（可选）" : "Covalent connections (optional)"}
                </summary>
                <Mol1CovalentBonds
                  key={JSON.stringify(
                    components.map(
                      ({
                        kind,
                        value,
                        count,
                        chain_ids,
                        ligand_file,
                        modifications,
                      }) => ({
                        kind,
                        value,
                        count,
                        chain_ids,
                        ligand_file,
                        modifications,
                      }),
                    ),
                  )}
                  components={components}
                  value={bonds}
                  onChange={setBonds}
                  language={language}
                />
              </details>
            </>
          ),
        },
        {
          title: zh ? "选择预测方案" : "Choose the prediction settings",
          valid: settingsValid,
          content: (
            <>
              <Mol1Settings
                value={settings}
                onChange={setSettings}
                language={language}
                seedText={seedText}
                onSeedText={(text) => {
                  setSeedText(text);
                  setSettings((value) => ({
                    ...value,
                    additional_seeds: parseSeedText(text),
                  }));
                }}
              />
              <label className="field">
                {zh ? "计算设备" : "Compute device"}
                <select
                  value={device}
                  onChange={(e) => {
                    setDevice(e.target.value as typeof device);
                    if (e.target.value === "cpu")
                      setSettings({ ...settings, dtype: "fp32" });
                  }}
                >
                  <option value="cuda">NVIDIA GPU</option>
                  <option value="cpu">CPU</option>
                </select>
              </label>
              <label className="field">
                {zh ? "内存上限（MiB）" : "Memory limit (MiB)"}
                <input
                  type="number"
                  min={1024}
                  max={65536}
                  value={memory}
                  onChange={(e) => setMemory(Number(e.target.value))}
                />
              </label>
              <label className="field">
                {zh ? "主随机种子" : "Primary seed"}
                <input
                  type="number"
                  min={0}
                  max={2147483647}
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value))}
                />
              </label>
            </>
          ),
        },
        {
          title: zh ? "确认并提交" : "Review and submit",
          valid:
            valid && settingsValid && validMol1Features(settings, components),
          content: (
            <>
              <dl className="questionnaire-review">
                <dt>{zh ? "后端模型" : "Backend model"}</dt>
                <dd>Mol-1 base</dd>
                <dt>{zh ? "研究对象" : "Study components"}</dt>
                <dd>{components.length}</dd>
                <dt>{zh ? "候选结构数" : "Requested structures"}</dt>
                <dd>
                  {settings.samples * (settings.additional_seeds.length + 1)}
                </dd>
                <dt>{zh ? "共价连接" : "Covalent connections"}</dt>
                <dd>{bonds.length}</dd>
                <dt>{zh ? "结构预测用途" : "Prediction scope"}</dt>
                <dd>
                  {zh
                    ? "结构假设与模型置信度，不是实验亲和力。"
                    : "Structural hypotheses and model confidence, not measured affinity."}
                </dd>
              </dl>
              <p className="field-help">
                {zh
                  ? "公开基础模型不支持 Mol-1-constraint 的几何约束。"
                  : "The released base model does not expose Mol-1-constraint geometric restraints."}
              </p>
            </>
          ),
        },
      ]}
    />
  );
  return (
    <PredictionSetup
      language={language}
      components={components}
      model="Mol-1"
      seeds={[seed, ...settings.additional_seeds]}
      samples={settings.samples}
      valid={valid}
      draftControls={
        <PredictionDraftControls
          language={language}
          initial={initial}
          busy={run.busy || preparing}
          onName={setName}
          onResume={onResume}
          state={{
            name,
            components,
            settings: snapshotMol1Settings(settings),
            bonds,
            advanced,
            seed_text: seedText,
            device,
            memory,
            seed,
          }}
        />
      }
    >
      {questionnaire}
    </PredictionSetup>
  );
}
