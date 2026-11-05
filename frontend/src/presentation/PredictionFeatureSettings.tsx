import { useEffect, useId, useRef, useState } from "react";
import type { Language } from "../types";
import { PredictionFeatureDialog } from "./PredictionFeatureDialog";
import {
  featurePolicy,
  selectFeatureMode,
  type FeatureMode,
  type FeaturePolicy,
} from "./prediction-feature-policy";
import "./prediction-feature-settings.css";

export function PredictionFeatureSettings({
  value,
  onChange,
  language,
  contextKey = "",
  hasRna = false,
  clearNotice,
}: {
  value: Partial<FeaturePolicy>;
  onChange(value: FeaturePolicy): void;
  language: Language;
  contextKey?: string;
  hasRna?: boolean;
  clearNotice?: string;
}) {
  const zh = language === "zh",
    name = useId(),
    current = featurePolicy(value);
  const source = JSON.stringify([contextKey, current]);
  const trigger = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState<{
    source: string;
    value: FeaturePolicy;
  } | null>(null);
  const modes: [FeatureMode, string, string][] = [
    ["search", "自动搜索", "Automatic search"],
    ["uploaded", "已有 MSA", "Uploaded MSA"],
    ["none", "不使用 MSA", "No MSA"],
  ];
  useEffect(() => {
    if (editing && editing.source !== source) setEditing(null);
  }, [source, editing]);
  const selected = modes.find(([mode]) => mode === current.feature_mode);
  return (
    <>
      <div
        className="prediction-feature-settings"
        role="group"
        aria-label={zh ? "进化信息设置" : "Evolutionary information settings"}
      >
        <button
          ref={trigger}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={Boolean(editing)}
          onClick={() => setEditing({ source, value: { ...current } })}
          aria-label={zh ? "MSA 设置" : "MSA settings"}
        >
          MSA{" "}
          <strong>
            {selected
              ? selected[zh ? 1 : 2]
              : zh
                ? "请检查设置"
                : "Review settings"}
          </strong>
        </button>
        <label>
          {zh ? "结构模板" : "Templates"}
          <select
            aria-label={zh ? "结构模板" : "Templates"}
            disabled={current.feature_mode === "none"}
            value={current.use_template ? "on" : "off"}
            onChange={(event) =>
              onChange({
                ...current,
                use_template: event.target.value === "on",
              })
            }
          >
            <option value="off">{zh ? "关闭" : "Off"}</option>
            <option value="on">
              {current.feature_mode === "uploaded"
                ? zh
                  ? "使用模板文件"
                  : "Use supplied templates"
                : zh
                  ? "自动搜索"
                  : "Automatic"}
            </option>
          </select>
        </label>
        {current.feature_mode === "search" && !current.allow_network && (
          <span role="status">
            {zh ? "搜索需要联网许可" : "Search needs network permission"}
          </span>
        )}
      </div>
      {editing && (
        <PredictionFeatureDialog
          invoker={trigger.current}
          language={language}
          valid={
            editing.source === source &&
            modes.some(([mode]) => mode === editing.value.feature_mode)
          }
          cancel={() => setEditing(null)}
          save={() => {
            if (
              editing.source !== source ||
              !modes.some(([mode]) => mode === editing.value.feature_mode)
            )
              return;
            onChange(
              selectFeatureMode(editing.value, editing.value.feature_mode),
            );
            setEditing(null);
          }}
        >
          <fieldset
            className="feature-mode-choices"
            aria-label={zh ? "MSA 来源" : "MSA source"}
          >
            {modes.map(([mode, cn, en]) => (
              <label
                key={mode}
                className={
                  editing.value.feature_mode === mode ? "selected" : ""
                }
              >
                <input
                  type="radio"
                  name={name}
                  value={mode}
                  checked={editing.value.feature_mode === mode}
                  onChange={() =>
                    setEditing({
                      ...editing,
                      value: selectFeatureMode(editing.value, mode),
                    })
                  }
                />
                {zh ? cn : en}
              </label>
            ))}
          </fieldset>
          <p>
            {editing.value.feature_mode === "search"
              ? zh
                ? "递交任务后搜索同源序列。"
                : "Find sequence homologs when the prediction runs."
              : editing.value.feature_mode === "uploaded"
                ? zh
                  ? "使用当前研究组分的比对文件；关闭窗口后选择文件。"
                  : "Use alignment files for the study components; select files after closing this dialog."
                : zh
                  ? "只使用输入序列，不使用 MSA 或结构模板。"
                  : "Use input sequences without MSAs or structural templates."}
          </p>
          {editing.value.feature_mode === "none" && clearNotice && (
            <p className="feature-clear-note">{clearNotice}</p>
          )}
          {editing.value.feature_mode !== "none" && (
            <div className="feature-policy-choices">
              <label>
                <input
                  type="checkbox"
                  checked={editing.value.allow_network}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      value: {
                        ...editing.value,
                        allow_network: event.target.checked,
                      },
                    })
                  }
                />
                {zh
                  ? "允许本任务发送序列到配置的 MSA 服务并获取模板结构"
                  : "Allow this task to send sequences to the configured MSA service and retrieve template structures"}
              </label>
              {(hasRna || editing.value.use_rna_msa) && (
                <label>
                  <input
                    type="checkbox"
                    checked={editing.value.use_rna_msa}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        value: {
                          ...editing.value,
                          use_rna_msa: event.target.checked,
                        },
                      })
                    }
                  />
                  {zh ? "使用 RNA MSA" : "Use RNA MSAs"}
                </label>
              )}
            </div>
          )}
        </PredictionFeatureDialog>
      )}
    </>
  );
}
