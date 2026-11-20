import { useEffect, useRef, useState, type ReactNode } from "react";
import { assetDownloadUrl } from "../research/asset-download";
import type { Language } from "../types";
import type { PreviewComponent } from "./PredictionEntityPreview";
import { usePredictionHeadingFocus } from "./prediction-heading-focus";
import { PredictionInputPreview } from "./PredictionInputPreview";
import { predictionSettingsSummary } from "./prediction-settings-summary";
import "./prediction-workspace.css";
import "./prediction-setup-summary.css";

/** A view of the form's current values; never a second draft or task authority. */
export function PredictionSetup({
  language,
  components,
  model,
  seeds,
  samples,
  valid,
  children,
  enabled = true,
  draftControls,
}: {
  language: Language;
  components: PreviewComponent[];
  model: string;
  seeds: number[];
  samples: number;
  valid: boolean;
  children: ReactNode;
  enabled?: boolean;
  draftControls?: ReactNode;
}) {
  const root = usePredictionHeadingFocus(enabled);
  const [preview, setPreview] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!enabled) setPreview(false);
  }, [enabled]);
  if (!enabled) return children;
  const zh = language === "zh";
  const summary = predictionSettingsSummary(seeds, samples, zh);
  const names = {
    protein: zh ? "蛋白质" : "Protein",
    ligand: zh ? "配体" : "Ligand",
    dna: "DNA",
    rna: "RNA",
    ion: zh ? "离子" : "Ion",
  };
  return (
    <div className="prediction-setup-layout" ref={root}>
      <div className="prediction-form-body">{children}</div>
      <aside
        className="prediction-setup"
        aria-label={zh ? "研究设置概览" : "Study setup"}
      >
        <h2>{zh ? "研究设置" : "Review setup"}</h2>
        <div className="prediction-setup-content">
          <dl>
            <div>
              <dt>{zh ? "后端模型" : "Prediction model"}</dt>
              <dd>{model}</dd>
            </div>
            <div>
              <dt>{zh ? "请求构象" : "Requested structures"}</dt>
              <dd>{summary.structures}</dd>
            </div>
          </dl>
          <ul
            className="prediction-entity-summary"
            aria-label={zh ? "当前研究组分" : "Current study entities"}
          >
            {components.map((item, index) => (
              <li key={index}>
                <details>
                  <summary
                    aria-label={`${names[item.kind]} ${zh ? "材料" : "input"} ${index + 1}`}
                  >
                    <span className="prediction-entity-number" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span>{names[item.kind]}</span>
                    <small>{item.count} ×</small>
                    <span
                      className="prediction-entity-chevron"
                      aria-hidden="true"
                    >
                      ›
                    </span>
                    <span
                      className={
                        "prediction-input-state" +
                        (item.value.trim() || item.ligand_file
                          ? " is-provided"
                          : "")
                      }
                    >
                      {item.value.trim() || item.ligand_file
                        ? zh
                          ? "已填写"
                          : "Provided"
                        : zh
                          ? "待填写"
                          : "Not provided"}
                    </span>
                  </summary>
                  <div className="prediction-entity-input">
                    {item.ligand_file ? (
                      <a
                        href={assetDownloadUrl(item.ligand_file, item.ligand_record)}
                        download
                      >
                        {zh
                          ? "下载已选结构文件"
                          : "Download selected structure input"}
                      </a>
                    ) : item.value.trim() ? (
                      <pre>{item.value}</pre>
                    ) : (
                      <p>
                        {zh
                          ? "请在任务步骤中填写这项材料。"
                          : "Provide this input in the task form."}
                      </p>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
          {summary.structures === "—" && (
            <p className="prediction-setup-warning" role="status">
              {zh ? "请检查计算设置。" : "Check calculation settings."}
            </p>
          )}
          <details
            className="prediction-calculation-details"
            open={summary.structures === "—"}
          >
            <summary>{zh ? "计算详情" : "Calculation details"}</summary>
            <dl>
              <div>
                <dt>{zh ? "随机种子" : "Seeds"}</dt>
                <dd>{summary.seeds}</dd>
              </div>
              <div>
                <dt>{zh ? "研究组分" : "Entities"}</dt>
                <dd>{components.length}</dd>
              </div>
              <div>
                <dt>{zh ? "总拷贝数" : "Total copies"}</dt>
                <dd>{components.reduce((sum, item) => sum + item.count, 0)}</dd>
              </div>
            </dl>
          </details>
          <p className={"prediction-setup-status" + (valid ? " is-valid" : "")}>
            {valid
              ? zh
                ? "输入可继续检查与确认"
                : "Inputs ready to review"
              : zh
                ? "填写材料后继续"
                : "Complete the study inputs"}
          </p>
          {draftControls}
        </div>
        <button
          ref={trigger}
          type="button"
          className="prediction-preview-open"
          onClick={() => setPreview(true)}
        >
          {zh ? "预览输入" : "Preview inputs"}
        </button>
      </aside>
      {preview && (
        <PredictionInputPreview
          components={components}
          model={model}
          seeds={seeds}
          samples={samples}
          language={language}
          onClose={() => {
            setPreview(false);
            trigger.current?.focus();
          }}
        />
      )}
    </div>
  );
}
