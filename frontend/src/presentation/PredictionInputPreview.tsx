import { PredictionReviewDialog } from "./PredictionReviewDialog";
import type { Language } from "../types";
import {
  PredictionEntityPreview,
  type PreviewComponent,
} from "./PredictionEntityPreview";
import "./prediction-input-preview.css";
import { predictionSettingsSummary } from "./prediction-settings-summary";

/** Read-only projection of the current form, independent of admission and task execution. */
export function PredictionInputPreview({
  components,
  model,
  seeds,
  samples,
  language,
  onClose,
}: {
  components: PreviewComponent[];
  model: string;
  seeds: number[];
  samples: number;
  language: Language;
  onClose(): void;
}) {
  const zh = language === "zh";
  const summary = predictionSettingsSummary(seeds, samples, zh);
  return (
    <PredictionReviewDialog
      language={language}
      title={zh ? "预览研究输入" : "Preview study inputs"}
      onClose={onClose}
    >
      <dl className="prediction-preview-settings">
        <div>
          <dt>{zh ? "后端模型" : "Prediction model"}</dt>
          <dd>{model}</dd>
        </div>
        <div>
          <dt>{zh ? "随机种子" : "Seeds"}</dt>
          <dd>{summary.seeds}</dd>
        </div>
        <div>
          <dt>{zh ? "请求构象" : "Requested structures"}</dt>
          <dd>{summary.structures}</dd>
        </div>
      </dl>
      <div className="prediction-preview-entities">
        {components.map((item, index) => (
          <PredictionEntityPreview
            key={`${item.kind}-${index}`}
            item={item}
            index={index}
            language={language}
          />
        ))}
        {components.length === 0 && (
          <p>{zh ? "尚未填写研究材料" : "No study inputs yet"}</p>
        )}
      </div>
    </PredictionReviewDialog>
  );
}
