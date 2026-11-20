import { PredictionReviewDialog } from "./PredictionReviewDialog";
import { useId, useState } from "react";
import type { Language } from "../types";
import { assetDownloadUrl } from "../research/asset-download";
import {
  PredictionEntityContent,
  predictionEntityLabel,
  type PreviewComponent,
} from "./PredictionEntityPreview";
import "./prediction-input-preview.css";
import "./prediction-input-inspector.css";
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
  const [selection, select] = useState(0);
  const index = Math.min(selection, components.length - 1);
  const selected = components[index];
  const label = selected ? predictionEntityLabel(selected, index, language) : "";
  const original = selected?.ligand_file
    ? assetDownloadUrl(selected.ligand_file, selected.ligand_record)
    : null;
  const panel = useId();
  return (
    <PredictionReviewDialog
      language={language}
      title={zh ? "预览研究输入" : "Preview study inputs"}
      onClose={onClose}
    >
      <div className="prediction-input-inspector">
        <aside className="prediction-input-sidebar">
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
          {selected && (
            <div
              className="prediction-input-choices"
              role="group"
              aria-label={zh ? "研究组分" : "Study entities"}
            >
              {components.map((item, position) => (
                <button
                  type="button"
                  key={position}
                  aria-pressed={position === index}
                  aria-controls={panel}
                  onClick={() => select(position)}
                >
                  <span>{predictionEntityLabel(item, position, language)}</span>
                  <small>{item.count} ×</small>
                </button>
              ))}
            </div>
          )}
          {original && (
            <a className="prediction-input-source" href={original} download>
              {zh ? "下载已选结构文件" : "Download selected structure input"}
            </a>
          )}
        </aside>
        <section
          id={panel}
          className="prediction-input-panel"
          aria-label={label || undefined}
        >
          {selected ? (
            <>
              <h3>{label}</h3>
              <PredictionEntityContent
                key={`${selected.kind}-${index}`}
                item={selected}
                language={language}
                label={label}
                originalCoordinates
              />
            </>
          ) : (
            <p>{zh ? "尚未填写研究材料" : "No study inputs yet"}</p>
          )}
        </section>
      </div>
    </PredictionReviewDialog>
  );
}
