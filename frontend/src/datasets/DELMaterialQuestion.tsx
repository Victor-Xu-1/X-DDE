import { ChoiceCards } from "../guided/ChoiceCards";
import { AssetPicker } from "../operations/AssetPicker";
import { DatasetPicker } from "./DatasetPicker";
import { SourcePicker } from "./SourcePicker";
import { DELReadFiles } from "./DELReadFiles";
import type { DELFormState } from "./useDELForm";

export function DELMaterialQuestion({ model }: { model: DELFormState }) {
  const {
    mode,
    zh,
    inputKind,
    setInputKind,
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
      {mode === "analyze" && (
        <ChoiceCards<"new" | "counts">
          label={zh ? "材料来源" : "Material source"}
          value={inputKind}
          onChange={setInputKind}
          options={[
            {
              value: "new",
              title: zh ? "上传新计数表" : "New count table",
            },
            {
              value: "counts",
              title: zh ? "历史计数结果" : "Historical counts",
            },
          ]}
        />
      )}
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
      {hasFile && mode !== "validate" && mode !== "decode" && (
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
          values={definitions}
          onChange={setDefinitions}
          language={language}
          label={zh ? "选择已核实的库定义" : "Validated library definition"}
        />
      )}
      {(!hasFile && mode !== "enumerate") || mode === "followup" ? (
        <SourcePicker
          role={sourceRole}
          values={source}
          onChange={setSource}
          language={language}
          label={zh ? "选择完成的研究结果" : "Completed study result"}
        />
      ) : null}
    </div>
  );
}
