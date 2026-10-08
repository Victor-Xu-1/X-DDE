import { useEffect, useState } from "react";
import { useExampleReference, useExampleTask } from "../examples/context";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { AssetPicker } from "../operations/AssetPicker";
import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { useSdfAsset } from "../research/useSdfAsset";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
import { AdmetSettings } from "./AdmetSettings";
import { admetDefaults, admetLimits, admetVersions } from "./generated";
import type { AdmetOptions, SourceKind } from "./types";

export function AdmetForm({
  language,
  onCreated,
  initialMolecule = null,
}: {
  language: Language;
  onCreated(job: Job): void;
  initialMolecule?: MoleculeRef | null;
}) {
  const exampleLibrary = useExampleReference("library");
  const preset = useExampleTask("admet_predict");
  const zh = language === "zh",
    run = useTaskSubmit(onCreated),
    availability = useTaskReadiness("admet.predict");
  const single = useSdfAsset(language, admetLimits.maxInputBytes),
    library = useSdfAsset(language, admetLimits.maxInputBytes);
  const [sourceKind, setSourceKind] = useState<SourceKind>(
      exampleLibrary ? "library" : "molecule",
    ),
    [molecule, setMolecule] = useState<MoleculeRef | null>(initialMolecule);
  const [options, setOptions] = useState<AdmetOptions>({
      ...admetDefaults,
      ...preset?.options,
    }),
    [name, setName] = useState("");
  useEffect(() => {
    if (exampleLibrary) void library.choose(exampleLibrary.asset_id);
  }, [exampleLibrary?.asset_id, library.choose]);
  useEffect(() => {
    if (initialMolecule) {
      setMolecule(initialMolecule);
      void single.choose(initialMolecule.asset_id);
    }
  }, [
    initialMolecule?.asset_id,
    initialMolecule?.sha256,
    initialMolecule?.record,
    initialMolecule?.conformer,
    initialMolecule?.version_id,
    single.choose,
  ]);
  const selected = sourceKind === "molecule" ? single : library;
  const valid =
    sourceKind === "molecule"
      ? Boolean(
          molecule &&
          single.asset?.id === molecule.asset_id &&
          single.asset.sha256 === molecule.sha256,
        )
      : Boolean(library.asset);
  function configure(change: Partial<AdmetOptions>) {
    setOptions((value) => ({ ...value, ...change }));
  }
  return (
    <Questionnaire
      language={language}
      ready={availability.ready}
      busy={run.busy || selected.loading}
      error={run.error || selected.error || availability.error}
      unavailable={
        zh
          ? "请在安装与组件中部署独立 ADMET-AI 模型。"
          : "Install the independent ADMET-AI model in Installation & components."
      }
      submitLabel={zh ? "开始性质预测" : "Predict properties"}
      onSubmit={() =>
        run.submit({
          operation: "admet_predict",
          name:
            name.trim() ||
            (zh
              ? "性质与早期安全性预测"
              : "ADMET and early safety predictions"),
          molecule: sourceKind === "molecule" ? molecule : null,
          library:
            sourceKind === "library" && library.asset
              ? { asset_id: library.asset.id, sha256: library.asset.sha256 }
              : null,
          scientific_inputs:
            sourceKind === "molecule" && molecule ? [molecule] : [],
          options,
        })
      }
      steps={[
        {
          title: zh ? "选择分子范围" : "Choose molecular scope",
          valid: true,
          content: (
            <ChoiceCards<SourceKind>
              label={
                zh
                  ? "这次预测哪些分子？"
                  : "Which molecules should be predicted?"
              }
              value={sourceKind}
              onChange={setSourceKind}
              options={[
                {
                  value: "molecule",
                  title: zh ? "一个研究分子" : "One research molecule",
                  note: zh
                    ? "提供一个分子，确认需要预测的结构。"
                    : "Provide one molecule and confirm the structure to predict.",
                },
                {
                  value: "library",
                  title: zh ? "一组候选分子" : "A candidate set",
                  note: zh
                    ? "处理 SDF 文件全部记录，最多 50 个。"
                    : "Read every SDF record, at most 50.",
                },
              ]}
            />
          ),
        },
        {
          title: zh ? "提供分子" : "Provide molecules",
          valid: valid && !selected.loading,
          content: (
            <>
              {sourceKind === "molecule" ? (
                <ReferencePicker
                  kind="ligand"
                  allowedSuffixes={[".sdf"]}
                  value={molecule}
                  onChange={(value) => {
                    setMolecule(value);
                    void single.choose(value?.asset_id ?? "");
                  }}
                  language={language}
                  label={zh ? "研究分子" : "Research molecule"}
                />
              ) : (
                <AssetPicker
                  kind="ligand"
                  allowedSuffixes={[".sdf"]}
                  value={library.asset?.id ?? ""}
                  onChange={(id) => void library.choose(id)}
                  language={language}
                  label={zh ? "候选分子 SDF 文件" : "Candidate SDF file"}
                />
              )}
              <Hint
                label={
                  zh
                    ? "输入需要准备成什么样？"
                    : "What input preparation is needed?"
                }
              >
                {zh
                  ? "接受二维或三维 SDF，每个分子 1–256 个非氢原子；文件不超过 8 MB。多成分盐或混合物需先明确准备。无效记录和重复分子会保留原编号，不会静默丢弃。"
                  : "Use 2D or 3D SDF with 1–256 heavy atoms per molecule and files up to 8 MB. Prepare disconnected salts or mixtures explicitly. Invalid and duplicate records retain original indices."}
              </Hint>
            </>
          ),
        },
        {
          title: zh ? "选择推荐设置" : "Choose settings",
          valid:
            [1, 2].includes(options.cpu) &&
            [2048, 4096, 8192].includes(options.memory_mib),
          content: (
            <AdmetSettings
              language={language}
              options={options}
              configure={configure}
              name={name}
              onName={setName}
            />
          ),
        },
        {
          title: zh ? "确认预测" : "Review prediction",
          valid,
          content: (
            <>
              <dl className="questionnaire-review">
                <dt>{zh ? "输入" : "Input"}</dt>
                <dd>
                  {selected.asset?.name}
                  {sourceKind === "molecule"
                    ? ` · #${(molecule?.record ?? 0) + 1}`
                    : zh
                      ? " · 全部记录"
                      : " · All records"}
                </dd>
                <dt>{zh ? "模型" : "Model"}</dt>
                <dd>
                  ADMET-AI {admetVersions["admet-ai"]} · Chemprop{" "}
                  {admetVersions.chemprop}
                </dd>
                <dt>{zh ? "输出" : "Output"}</dt>
                <dd>
                  {zh ? "41 个原始预测终点" : "41 native prediction endpoints"}
                </dd>
                <dt>{zh ? "原始分子" : "Original molecules"}</dt>
                <dd>
                  {zh ? "保持原样，可继续复用" : "Unchanged and reusable"}
                </dd>
              </dl>
              <Hint
                label={
                  zh ? "结果如何用于下一步？" : "How can results be reused?"
                }
              >
                {zh
                  ? "用于早期比较；结果带各终点的单位与物种。可将原始分子继续交给分子准备、对接等任务。预测不改变分子，也不替代实验确认。"
                  : "Use for early comparison with endpoint units and species. Reuse the original molecule in preparation or docking; predictions do not edit molecules or replace experiments."}
              </Hint>
            </>
          ),
        },
      ]}
    />
  );
}
