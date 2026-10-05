import { AssetPicker } from "../operations/AssetPicker";
import { useSdfAsset } from "../research/useSdfAsset";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import { useEffect } from "react";

export function LibraryInput({
  language,
  value,
  onChange,
}: {
  language: Language;
  value: MoleculeRef | null;
  onChange(value: MoleculeRef | null): void;
}) {
  const input = useSdfAsset(language),
    zh = language === "zh";
  useEffect(() => {
    if (value && !input.asset) void input.choose(value.asset_id);
  }, [value?.asset_id, input.choose]);
  return (
    <>
      <AssetPicker
        kind="ligand"
        value={value?.asset_id ?? ""}
        language={language}
        allowedSuffixes={[".sdf"]}
        label={zh ? "整组 SDF 分子文件" : "Whole SDF molecular library"}
        onChange={async (id) => {
          onChange(null);
          const asset = await input.choose(id);
          if (asset)
            onChange({
              asset_id: asset.id,
              sha256: asset.sha256,
              record: 0,
              conformer: 0,
            });
        }}
      />
      {input.error && <p role="alert">{input.error}</p>}
      {input.asset && (
        <p>
          {input.asset.name} ·{" "}
          {zh
            ? "使用整个文件中的记录"
            : "Uses all original records in this file"}
        </p>
      )}
    </>
  );
}
