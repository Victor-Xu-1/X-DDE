import { useState } from "react";
import { useExampleReference, useExampleTask } from "../examples/context";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { StructureViewer } from "../viewer/StructureViewer";
import { Questionnaire } from "../guided/Questionnaire";
import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import {
  preparationDefaults,
  type PreparationOptions,
} from "./preparation-types";

export function StructurePrepareForm({
  language,
  onCreated,
  initialStructure,
}: {
  language: Language;
  onCreated(job: Job): void;
  initialStructure?: MoleculeRef;
}) {
  const example = useExampleReference(
    "structure",
    "brd4",
    "her2",
    "mz1",
    "rna",
  );
  const preset = useExampleTask("structure_prepare")?.options;
  initialStructure ??= example ?? undefined;
  const zh = language === "zh",
    run = useTaskSubmit(onCreated),
    availability = useTaskReadiness("biopython.prepare");
  const [structure, setStructure] = useState<MoleculeRef | null>(
      initialStructure ?? null,
    ),
    [chainMode, setChainMode] = useState<"all" | "select">(
      preset?.chains.length ? "select" : "all",
    ),
    [chains, setChains] = useState<string[]>(preset?.chains ?? []),
    [availableChains, setAvailableChains] = useState<string[]>([]),
    [water, setWater] = useState(false),
    [heterogens, setHeterogens] = useState<"keep" | "remove">(
      preset?.heterogens ?? "keep",
    ),
    [format, setFormat] = useState<"pdb" | "cif">("pdb"),
    [model, setModel] = useState(0),
    [alternate, setAlternate] = useState(preset?.alternate ?? "reject"),
    [name, setName] = useState("");
  const options: PreparationOptions = {
    ...preparationDefaults,
    chains: chainMode === "all" ? [] : chains,
    format,
    waters: water,
    heterogens,
    model_index: model,
    alternate,
  };
  const selectionValid =
    Boolean(structure) && (chainMode === "all" || chains.length > 0);
  function toggle(chain: string) {
    setChains((value) =>
      value.includes(chain)
        ? value.filter((c) => c !== chain)
        : [...value, chain],
    );
  }
  return (
    <Questionnaire
      language={language}
      ready={availability.ready}
      busy={run.busy}
      error={run.error || availability.error}
      unavailable={
        zh
          ? "请在安装与组件中配置独立结构处理环境。"
          : "Configure the independent structural environment in Installation & components."
      }
      submitLabel={zh ? "保存准备后的结构" : "Save prepared structure"}
      onSubmit={() =>
        run.submit({
          operation: "structure_prepare",
          name: name.trim() || (zh ? "结构准备" : "Structure preparation"),
          structure: structure!,
          options,
          scientific_inputs: [structure!],
        })
      }
      steps={[
        {
          title: zh ? "选择结构" : "Choose structure",
          valid: Boolean(structure),
          content: (
            <ReferencePicker
              language={language}
              kind="structure"
              allowedSuffixes={[".pdb", ".cif"]}
              label={zh ? "待准备的结构" : "Structure to prepare"}
              value={structure}
              onChange={(value) => {
                setStructure(value);
                setChains([]);
                setAvailableChains([]);
                setModel(0);
                setChainMode("all");
              }}
            />
          ),
        },
        {
          title: zh ? "选择研究部分" : "Choose research region",
          valid: selectionValid,
          content: (
            <>
              <ChoiceCards<"all" | "select">
                label={zh ? "保留哪些链？" : "Which chains to keep?"}
                value={chainMode}
                onChange={setChainMode}
                options={[
                  {
                    value: "all",
                    title: zh
                      ? "保留全部链（推荐）"
                      : "Keep all chains (recommended)",
                    note: zh
                      ? "保留此模型的多链环境。"
                      : "Preserve this model's chain context.",
                  },
                  {
                    value: "select",
                    title: zh ? "在预览中选择链" : "Select chains in preview",
                    note: zh
                      ? "点选残基所在的链，或勾选下方链；仅限第一模型。"
                      : "Click a residue's chain or choose below; first model only.",
                  },
                ]}
              />
              {structure && (
                <StructureViewer
                  key={structure.asset_id}
                  language={language}
                  urls={["/api/assets/" + structure.asset_id]}
                  onSceneLoaded={(scene) => setAvailableChains(scene.chains)}
                  onAtomSelected={(selected) => {
                    if (selected && chainMode === "select" && model === 0)
                      toggle(selected.chain);
                  }}
                />
              )}
              {chainMode === "select" && (
                <div
                  role="group"
                  aria-label={zh ? "所选链" : "Selected chains"}
                >
                  {availableChains.map((chain) => (
                    <label className="checkbox-line" key={chain}>
                      <input
                        type="checkbox"
                        checked={chains.includes(chain)}
                        onChange={() => toggle(chain)}
                      />
                      {zh ? "链" : "Chain"} {chain || "(blank)"}
                    </label>
                  ))}
                </div>
              )}
              <details>
                <summary>
                  {zh
                    ? "专家：模型与替代坐标"
                    : "Expert: model and alternate coordinates"}
                </summary>
                <label className="field">
                  {zh ? "模型序号（从1开始）" : "Model number (starts at 1)"}
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={model + 1}
                    onChange={(e) => {
                      setModel(Number(e.target.value) - 1);
                      setChainMode("all");
                      setChains([]);
                    }}
                  />
                </label>
                <label className="field">
                  {zh ? "替代原子位置" : "Alternate atom location"}
                  <select
                    value={alternate}
                    onChange={(e) => setAlternate(e.target.value)}
                  >
                    <option value="reject">
                      {zh
                        ? "遇到歧义先停止（推荐）"
                        : "Stop on ambiguity (recommended)"}
                    </option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                  </select>
                </label>
                <Hint
                  label={
                    zh
                      ? "如何理解替代坐标？"
                      : "What are alternate coordinates?"
                  }
                >
                  {zh
                    ? "同一原子可能有多个实验位置。选择的标记必须存在于每个歧义位点，不会自动取最高占有率或拼合不同状态。预览显示第一模型，其他模型由实际后端校验。"
                    : "An atom may have several observed positions. Your label must exist at every ambiguous site; no automatic occupancy choice or mixed states. Preview shows the first model; other model selections are validated by the backend."}
                </Hint>
              </details>
            </>
          ),
        },
        {
          title: zh ? "选择保留内容" : "Choose retained contents",
          valid: true,
          content: (
            <>
              <ChoiceCards<"keep" | "remove">
                label={
                  zh
                    ? "辅因子、配体与离子怎么处理？"
                    : "How to handle cofactors, ligands and ions?"
                }
                value={heterogens}
                onChange={setHeterogens}
                options={[
                  {
                    value: "keep",
                    title: zh ? "保留（推荐）" : "Keep (recommended)",
                    note: zh
                      ? "避免误删功能所需的成分；后续计算按实际支持范围校验。"
                      : "Avoid deleting functional components; downstream tools validate supported chemistry.",
                  },
                  {
                    value: "remove",
                    title: zh ? "移除非聚合物" : "Remove nonpolymers",
                    note: zh
                      ? "保留识别出的蛋白修饰残基，移除其他 HETATM 成分。"
                      : "Recognized modified amino acids remain; other heterogens are removed.",
                  },
                ]}
              />
              <ChoiceCards<"remove" | "keep">
                label={zh ? "水分子怎么处理？" : "How to handle water?"}
                value={water ? "keep" : "remove"}
                onChange={(v) => setWater(v === "keep")}
                options={[
                  { value: "remove", title: zh ? "移除水" : "Remove water" },
                  {
                    value: "keep",
                    title: zh ? "保留实验水" : "Keep observed water",
                  },
                ]}
              />
              <label className="field">
                {zh ? "输出格式" : "Output format"}
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as "pdb" | "cif")}
                >
                  <option value="pdb">
                    {zh
                      ? "PDB：用于口袋和对接"
                      : "PDB: for pockets and docking"}
                  </option>
                  <option value="cif">
                    {zh
                      ? "mmCIF：保留更大编号空间"
                      : "mmCIF: wider identifier namespace"}
                  </option>
                </select>
              </label>
              <details>
                <summary>{zh ? "任务名称" : "Task name"}</summary>
                <label className="field">
                  {zh ? "名称（可选）" : "Name (optional)"}
                  <input
                    value={name}
                    maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              </details>
            </>
          ),
        },
        {
          title: zh ? "确认保存" : "Review preparation",
          valid:
            selectionValid &&
            model >= 0 &&
            model <= 99 &&
            (model === 0 || chainMode === "all"),
          content: (
            <>
              <dl className="questionnaire-review">
                <dt>{zh ? "来源版本" : "Source version"}</dt>
                <dd>{structure?.version_id ?? structure?.asset_id}</dd>
                <dt>{zh ? "模型/链" : "Model / chains"}</dt>
                <dd>
                  {model + 1} ·{" "}
                  {chainMode === "all"
                    ? zh
                      ? "全部链"
                      : "All chains"
                    : chains.join(", ")}
                </dd>
                <dt>{zh ? "水/其他成分" : "Water / other components"}</dt>
                <dd>
                  {water
                    ? zh
                      ? "保留水"
                      : "Keep water"
                    : zh
                      ? "移除水"
                      : "Remove water"}{" "}
                  ·{" "}
                  {heterogens === "keep"
                    ? zh
                      ? "保留辅因子/配体"
                      : "Keep cofactors/ligands"
                    : zh
                      ? "移除非聚合物"
                      : "Remove nonpolymers"}
                </dd>
                <dt>{zh ? "保存" : "Save"}</dt>
                <dd>
                  {format.toUpperCase()} · {zh ? "新版本" : "New version"}
                </dd>
              </dl>
              <Hint
                label={
                  zh ? "结构准备完成了什么？" : "What does preparation do?"
                }
              >
                {zh
                  ? "选取已有坐标并转换格式。不会补缺失原子、加氢、确定质子状态、生成生物学装配或预测结合；这些需要后续独立任务。"
                  : "Select observed coordinates and export the format. Missing atoms, hydrogens, protonation, biological assembly and binding are not inferred."}
              </Hint>
            </>
          ),
        },
      ]}
    />
  );
}
