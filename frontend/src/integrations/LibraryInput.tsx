import { useEffect, useRef } from "react";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { useSdfAsset } from "../research/useSdfAsset";
import { referenceKey } from "../research/input-catalog";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";

export function LibraryInput({
  language,
  value,
  onChange,
  onVerified,
  selectRecords = false,
}: {
  language: Language;
  value: MoleculeRef | null;
  onChange(value: MoleculeRef | null): void;
  onVerified?(value: MoleculeRef | null): void;
  selectRecords?: boolean;
}) {
  const input = useSdfAsset(language),
    zh = language === "zh";
  const callback = useRef(onVerified);
  callback.current = onVerified;
  const key = referenceKey(value);
  const matches = Boolean(
    value &&
    input.asset?.id === value.asset_id &&
    input.asset.sha256 === value.sha256,
  );
  const whole = Boolean(value && value.record === 0 && value.conformer === 0);
  useEffect(() => {
    if (!value) {
      void input.choose("");
      return;
    }
    if (!matches) void input.choose(value.asset_id, value.sha256);
  }, [key, input.choose]);
  useEffect(() => {
    callback.current?.(matches && whole && !input.loading ? value : null);
  }, [key, matches, whole, input.loading]);
  return (
    <>
      <ReferencePicker
        kind="ligand"
        wholeFile
        value={value}
        onChange={onChange}
        language={language}
        allowedSuffixes={[".sdf"]}
        label={zh ? "整组 SDF 分子文件" : "Whole SDF molecular library"}
        onAssetVerified={(asset, reference) =>
          input.adopt(asset, reference.sha256)
        }
      />
      {input.loading && (
        <p role="status">
          {zh ? "正在核对分子库…" : "Checking the molecular library…"}
        </p>
      )}
      {input.error && (
        <div className="error-box">
          <p role="alert">{input.error}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              value && void input.choose(value.asset_id, value.sha256)
            }
          >
            {zh ? "重新读取分子库" : "Retry molecular library"}
          </button>
        </div>
      )}
      {value && !whole && (
        <p role="alert">
          {zh
            ? "请选择完整的 SDF 文件；单个分子记录不能代替整组分子库。"
            : "Choose the whole SDF file; an individual record cannot substitute for the library."}
        </p>
      )}
      {matches && whole && (
        <p>
          {input.asset!.name} ·{" "}
          {selectRecords
            ? zh
              ? "下一步选择用于计算的分子"
              : "Select molecules for calculation in the next step"
            : zh
              ? "使用整个文件中的记录"
              : "Uses all original records in this file"}
        </p>
      )}
    </>
  );
}
