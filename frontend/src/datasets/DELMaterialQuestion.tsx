import { ChoiceCards } from "../guided/ChoiceCards";
import { DELCountMaterials } from "./DELCountMaterials";
import { AssetPicker } from "../operations/AssetPicker";
import { DatasetPicker } from "./DatasetPicker";
import { SourcePicker } from "./SourcePicker";
import { DELReadFiles } from "./DELReadFiles";
import type { DELFormState } from "./useDELForm";
import type { ToolId } from "../operations/catalog";
import { DELPrerequisite } from "./DELPrerequisite";

export function DELMaterialQuestion({
  model,
  onPrepare,
}: {
  model: DELFormState;
  onPrepare?(tool: ToolId): void;
}) {
  const {
    mode,
    zh,
    language,
    asset,
    chooseDefinition,
    hasFile,
    setAsset,
    definitions,
    setDefinitions,
    sourceRole,
    source,
    setSource,
    readLanes,
    setReadLanes,
  } = model;
  return (
    <div className="dataset-question-content">
      {mode === "model" && (
        <>
          <ChoiceCards<"train" | "predict">
            label={
              zh ? "如何使用研究模型？" : "How will the research model be used?"
            }
            value={model.modelAction}
            onChange={model.setModelAction}
            options={[
              {
                value: "train",
                title: zh
                  ? "建立并验证新模型"
                  : "Train and validate a new model",
              },
              {
                value: "predict",
                title: zh ? "使用历史模型预测" : "Apply a historical model",
              },
            ]}
          />
          {model.modelAction === "predict" && (
            <SourcePicker
              role="model"
              emptyAction={
                <DELPrerequisite
                  role="model"
                  language={language}
                  onPrepare={() => model.setModelAction("train")}
                />
              }
              values={model.models}
              onChange={model.setModels}
              language={language}
              label={zh ? "选择已训练的研究模型" : "Trained research model"}
            />
          )}
        </>
      )}
      {mode === "analyze" && <DELCountMaterials model={model} />}
      {mode === "validate" && (
        <AssetPicker
          kind="config"
          language={language}
          label={zh ? "DEL 库定义" : "DEL library definition"}
          value={asset?.id ?? ""}
          onChange={(id) => void chooseDefinition(id)}
          allowedSuffixes={[".json"]}
        />
      )}
      {mode === "decode" && (
        <DELReadFiles
          language={language}
          lanes={readLanes}
          onChange={setReadLanes}
        />
      )}
      {hasFile &&
        mode !== "validate" &&
        mode !== "decode" &&
        mode !== "analyze" && (
          <DatasetPicker
            kind="counts"
            value={asset}
            onChange={setAsset}
            language={language}
            label={
              mode === "followup"
                ? zh
                  ? "后续测量表"
                  : "Follow-up measurements"
                : zh
                  ? "DEL 计数表"
                  : "DEL count table"
            }
          />
        )}
      {["enumerate", "decode"].includes(mode) && (
        <SourcePicker
          role="definition"
          emptyAction={
            <DELPrerequisite
              role="definition"
              language={language}
              onPrepare={onPrepare}
            />
          }
          values={definitions}
          onChange={setDefinitions}
          language={language}
          label={zh ? "选择已核实的库定义" : "Validated library definition"}
        />
      )}
      {(!hasFile && mode !== "enumerate") || mode === "followup" ? (
        <SourcePicker
          role={sourceRole}
          emptyAction={
            <DELPrerequisite
              role={sourceRole}
              language={language}
              onPrepare={onPrepare}
            />
          }
          values={source}
          onChange={setSource}
          language={language}
          label={zh ? "选择完成的研究结果" : "Completed study result"}
        />
      ) : null}
    </div>
  );
}
