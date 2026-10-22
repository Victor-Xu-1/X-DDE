import { useEffect, useRef, useState } from "react";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import type { Asset } from "../operations/types";
import { AssetPicker } from "../operations/AssetPicker";
import { useBoltzMsa } from "./useBoltzMsa";
import { boltzMsaKey } from "./boltz-inputs";

export function BoltzMsaInput({
  chain,
  sequence,
  value,
  mode,
  language,
  onChange,
  onModeChange,
  onVerified,
}: {
  chain: string;
  sequence: string;
  value: MoleculeRef | null;
  mode: "provided" | "single";
  language: Language;
  onChange(value: MoleculeRef | null): void;
  onModeChange(value: "provided" | "single"): void;
  onVerified(key: string): void;
}) {
  const zh = language === "zh";
  const [selected, setSelected] = useState(value?.asset_id ?? "");
  const [asset, setAsset] = useState<Asset | null>(null);
  const previousProtein = useRef({ chain, sequence });
  const callbacks = useRef({ onChange, onVerified });
  callbacks.current = { onChange, onVerified };
  const reference: MoleculeRef | null =
    asset?.id === selected
      ? {
          asset_id: asset.id,
          sha256: asset.sha256,
          record: 0,
          conformer: 0,
          ...(value?.asset_id === asset.id && value.sha256 === asset.sha256
            ? { version_id: value.version_id }
            : {}),
        }
      : null;
  const inspection = useBoltzMsa(
    mode === "provided" ? reference : null,
    sequence,
  );
  const verifiedKey =
    mode === "provided" && reference && inspection.value
      ? boltzMsaKey({
          id: chain,
          kind: "protein",
          value: sequence,
          msa: reference,
        })
      : "";
  useEffect(() => {
    callbacks.current.onVerified(verifiedKey);
  }, [verifiedKey, chain]);
  useEffect(() => {
    if (
      previousProtein.current.chain === chain &&
      previousProtein.current.sequence === sequence
    )
      return;
    previousProtein.current = { chain, sequence };
    setSelected(value?.asset_id ?? "");
    setAsset(null);
    callbacks.current.onVerified("");
  }, [chain, sequence]);
  useEffect(() => {
    if (mode === "provided" && reference && inspection.value)
      callbacks.current.onChange(reference);
  }, [mode, inspection.value, reference?.asset_id, reference?.sha256]);
  return (
    <section
      className="boltz-msa-input"
      aria-label={(zh ? "链 " : "Chain ") + chain + " MSA"}
    >
      <label>
        {zh ? "进化信息" : "Evolutionary information"}
        <select
          value={mode}
          onChange={(event) => {
            const next = event.target.value as "provided" | "single";
            onModeChange(next);
          }}
        >
          <option value="provided">
            {zh ? "使用 MSA 文件 · 推荐" : "Use an MSA file · Recommended"}
          </option>
          <option value="single">
            {zh
              ? "仅单条序列 · 探索性基线"
              : "Single sequence · Exploratory baseline"}
          </option>
        </select>
      </label>
      {mode === "provided" ? (
        <>
          <AssetPicker
            kind="msa"
            value={selected}
            language={language}
            label={(zh ? "链 " : "Chain ") + chain + " MSA"}
            allowedSuffixes={[".a3m", ".csv"]}
            onChange={(id) => {
              setSelected(id);
              setAsset(null);
              callbacks.current.onChange(null);
              callbacks.current.onVerified("");
            }}
            onSelectedAsset={setAsset}
          />
          {inspection.value && (
            <p role="status">
              {inspection.value.rows.toLocaleString()}{" "}
              {zh ? "条序列" : "sequence rows"} · {inspection.value.columns}{" "}
              {zh ? "个比对列" : "alignment columns"}
            </p>
          )}
          {reference && !inspection.value && !inspection.error && (
            <p role="status">
              {zh
                ? "正在核对 MSA 与蛋白序列…"
                : "Matching the MSA to this protein…"}
            </p>
          )}
          {inspection.error && (
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
          )}
          <p className="field-help">
            {zh
              ? "支持 A3M；多蛋白配对比对可用 sequence、key 两列的 CSV。"
              : "Use A3M, or CSV with sequence and key columns for explicitly paired protein alignments."}
          </p>
        </>
      ) : (
        <p className="field-help">
          {zh
            ? "此基线不使用同源比对信息，预测质量可能降低。"
            : "This baseline omits evolutionary alignment information and may reduce prediction quality."}
        </p>
      )}
    </section>
  );
}
