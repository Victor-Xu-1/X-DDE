import { useEffect, useId, useRef, useState } from "react";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { AssetPicker } from "../operations/AssetPicker";
import { PredictionFeatureDialog } from "../presentation/PredictionFeatureDialog";
import { useBoltzMsa } from "./useBoltzMsa";
import { boltzMsaKey } from "./boltz-inputs";
import "../presentation/prediction-feature-settings.css";
import "./boltz-input-settings.css";

type Mode = "provided" | "single";
type Edit = {
  source: string;
  mode: Mode;
  selected: string;
  reference: MoleculeRef | null;
};

/** One native chain authority; cancelled file checks never commit to its task. */
export function BoltzMsaInput({
  chain,
  sequence,
  value,
  mode,
  language,
  onCommit,
  onVerified,
}: {
  chain: string;
  sequence: string;
  value: MoleculeRef | null;
  mode: Mode;
  language: Language;
  onCommit(mode: Mode, reference: MoleculeRef | null): void;
  onVerified(key: string): void;
}) {
  const zh = language === "zh",
    name = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const source = JSON.stringify([chain, sequence, mode, value]);
  const [edit, setEdit] = useState<Edit | null>(null);
  const editing = edit?.source === source ? edit : null;
  const reference = editing ? editing.reference : value;
  const activeMode = editing?.mode ?? mode;
  const inspection = useBoltzMsa(
    activeMode === "provided" ? reference : null,
    sequence,
  );
  const callbacks = useRef({ onCommit, onVerified });
  callbacks.current = { onCommit, onVerified };
  const verified =
    !editing && mode === "provided" && value && inspection.value
      ? boltzMsaKey({ id: chain, kind: "protein", value: sequence, msa: value })
      : "";
  useEffect(() => {
    callbacks.current.onVerified(verified);
  }, [verified, chain]);
  useEffect(() => {
    if (edit && edit.source !== source) setEdit(null);
  }, [source, edit]);
  const baseline = zh
    ? "此基线不使用同源比对信息，预测质量可能降低。"
    : "This baseline omits evolutionary alignment information and may reduce prediction quality.";
  const status =
    activeMode === "single" ? (
      <p className="field-help">{baseline}</p>
    ) : inspection.value ? (
      <p role="status">
        {inspection.value.name} · {inspection.value.rows.toLocaleString()}{" "}
        {zh ? "条序列" : "sequence rows"} · {inspection.value.columns}{" "}
        {zh ? "个比对列" : "alignment columns"}
      </p>
    ) : inspection.error ? (
      <div role="alert">
        <p>
          {zh
            ? "无法将此 MSA 与当前蛋白序列对应。请选择匹配的完整比对文件。"
            : "This MSA could not be matched to the current protein. Choose its complete corresponding alignment."}
        </p>
        <button type="button" onClick={inspection.retry}>
          {zh ? "重新核对" : "Check again"}
        </button>
      </div>
    ) : reference ? (
      <p role="status">
        {zh ? "正在核对 MSA 与蛋白序列…" : "Matching the MSA to this protein…"}
      </p>
    ) : null;
  return (
    <section
      className="boltz-msa-input"
      aria-label={(zh ? "链 " : "Chain ") + chain + " MSA"}
    >
      <div className="prediction-feature-settings boltz-msa-summary">
        <button
          ref={trigger}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={Boolean(editing)}
          aria-label={
            (zh ? "链 " : "Chain ") +
            chain +
            (zh ? " MSA 设置" : " MSA settings")
          }
          onClick={() =>
            setEdit({
              source,
              mode,
              selected: value?.asset_id ?? "",
              reference: value,
            })
          }
        >
          MSA{" "}
          <strong>
            {mode === "single"
              ? zh
                ? "单条序列"
                : "Single sequence"
              : zh
                ? "MSA 文件"
                : "MSA file"}
          </strong>
        </button>
        {!value && mode === "provided" && (
          <span>
            {zh ? "请选择此链的比对文件" : "Choose an alignment for this chain"}
          </span>
        )}
      </div>
      {!editing && status}
      {editing && (
        <PredictionFeatureDialog
          language={language}
          invoker={trigger.current}
          valid={
            editing.mode === "single" ||
            Boolean(editing.reference && inspection.value)
          }
          cancel={() => setEdit(null)}
          save={() => {
            if (
              editing.source !== source ||
              (editing.mode === "provided" &&
                (!editing.reference || !inspection.value))
            )
              return;
            callbacks.current.onCommit(
              editing.mode,
              editing.mode === "provided" ? editing.reference : null,
            );
            setEdit(null);
          }}
        >
          <div className="boltz-msa-editor">
            <p className="boltz-msa-chain">
              {zh ? "链 " : "Chain "}
              {chain} · {sequence.length} {zh ? "个残基" : "residues"}
            </p>
            <fieldset
              className="feature-mode-choices"
              aria-label={zh ? "MSA 来源" : "MSA source"}
            >
              {(["provided", "single"] as const).map((option) => (
                <label
                  key={option}
                  className={editing.mode === option ? "selected" : ""}
                >
                  <input
                    type="radio"
                    name={name}
                    checked={editing.mode === option}
                    onChange={() => setEdit({ ...editing, mode: option })}
                  />
                  {option === "provided"
                    ? zh
                      ? "MSA 文件"
                      : "MSA file"
                    : zh
                      ? "单条序列"
                      : "Single sequence"}
                </label>
              ))}
            </fieldset>
            {editing.mode === "provided" && (
              <>
                <AssetPicker
                  kind="msa"
                  value={editing.selected}
                  language={language}
                  label={(zh ? "链 " : "Chain ") + chain + " MSA"}
                  allowedSuffixes={[".a3m", ".csv"]}
                  onChange={(id) =>
                    setEdit((current) =>
                      current?.source === source
                        ? { ...current, selected: id, reference: null }
                        : current,
                    )
                  }
                  onSelectedAsset={(asset) =>
                    setEdit((current) => {
                      if (!current || current.source !== source) return current;
                      const next =
                        asset?.id === current.selected
                          ? {
                              asset_id: asset.id,
                              sha256: asset.sha256,
                              record: 0,
                              conformer: 0,
                              ...(value?.asset_id === asset.id &&
                              value.sha256 === asset.sha256
                                ? { version_id: value.version_id }
                                : {}),
                            }
                          : null;
                      return JSON.stringify(next) ===
                        JSON.stringify(current.reference)
                        ? current
                        : { ...current, reference: next };
                    })
                  }
                />
                <p className="field-help">
                  {zh
                    ? "支持 A3M；多蛋白配对比对可用 sequence、key 两列的 CSV。"
                    : "Use A3M, or CSV with sequence and key columns for explicitly paired protein alignments."}
                </p>
              </>
            )}
            {status}
          </div>
        </PredictionFeatureDialog>
      )}
    </section>
  );
}
