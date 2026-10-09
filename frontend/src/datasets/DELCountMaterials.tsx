import { useState } from "react";
import { ChoiceCards } from "../guided/ChoiceCards";
import { DatasetPicker } from "./DatasetPicker";
import type { DELFormState } from "./useDELForm";
import "./DELCountMaterials.css";

type MaterialState = Pick<
  DELFormState,
  | "zh"
  | "language"
  | "inputKind"
  | "setInputKind"
  | "asset"
  | "setAsset"
  | "setSource"
  | "setSamples"
  | "setComparisons"
>;
type CountSource = "new" | "history" | "counts";

/** One question selects an uploaded file, a historical file or a validated count result. */
export function DELCountMaterials({ model }: { model: MaterialState }) {
  const [fileSource, setFileSource] = useState<"new" | "history">("new"),
    [uploading, setUploading] = useState(false);
  const { zh, language, inputKind, asset } = model;
  const value: CountSource = inputKind === "counts" ? "counts" : fileSource;
  function chooseSource(next: CountSource) {
    if (uploading || next === value) return;
    model.setAsset(null);
    model.setSource([]);
    model.setSamples([]);
    model.setComparisons([]);
    model.setInputKind(next === "counts" ? "counts" : "new");
    if (next !== "counts") setFileSource(next);
  }
  return (
    <>
      <div className="del-count-material-source">
        <ChoiceCards<CountSource>
          label={zh ? "材料来源" : "Material source"}
          value={value}
          onChange={chooseSource}
          options={[
            {
              value: "new",
              title: zh ? "上传新计数表" : "New count table",
              disabled: uploading,
            },
            {
              value: "history",
              title: zh ? "历史文件" : "Historical file",
              disabled: uploading,
            },
            {
              value: "counts",
              disabled: uploading,
              title: zh ? "历史计数结果" : "Completed count result",
              hint: zh
                ? "使用测序解码和计数模块已完成、可核验的计数结果。"
                : "Use a verified result from the completed decoding and counting workflow.",
            },
          ]}
        />
      </div>
      {inputKind === "new" && (
        <DatasetPicker
          kind="counts"
          sourceMode={fileSource}
          onBusyChange={setUploading}
          value={asset}
          onChange={model.setAsset}
          language={language}
          label={zh ? "DEL 计数表" : "DEL count table"}
        />
      )}
    </>
  );
}
