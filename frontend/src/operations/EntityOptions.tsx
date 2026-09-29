import type { Component, Language } from "../types";
import { AssetPicker } from "./AssetPicker";
import { Hint } from "../guided/Hint";

export function EntityOptions({
  value,
  onChange,
  language,
  expert,
  features = false,
}: {
  value: Component;
  onChange(p: Partial<Component>): void;
  language: Language;
  expert: boolean;
  features?: boolean;
}) {
  const zh = language === "zh",
    polymer = ["protein", "dna", "rna"].includes(value.kind);
  return (
    <>
      {value.kind === "ligand" && (
        <details open={Boolean(value.ligand_file)}>
          <summary>
            {zh ? "使用已有的三维分子文件" : "Use an existing 3D molecule file"}
          </summary>
          <p className="small">
            {zh
              ? "每个配体使用一个三维结构。SDF 含多个分子时请拆分；性质计算支持整批 SDF。"
              : "Use one 3D structure per ligand. Split multi-record SDF files; property calculations accept whole libraries."}
          </p>
          <AssetPicker
            label={zh ? "配体文件" : "Ligand file"}
            kind="ligand"
            value={value.ligand_file ?? ""}
            onChange={(id) =>
              onChange({
                ligand_file: id || null,
                ...(id ? { value: "" } : {}),
              })
            }
            language={language}
          />
        </details>
      )}
      {(expert || features) && (
        <details open={features || undefined}>
          <summary>
            {zh
              ? "链、修饰与预先计算的特征"
              : "Chains, modifications and precomputed features"}
          </summary>
          {expert && (
            <label className="field">
              {zh ? "链名称（每个拷贝一个）" : "Chain IDs (one per copy)"}
              <input
                value={value.chain_ids?.join(",") ?? ""}
                placeholder={
                  zh ? "留空自动分配，如 A,B" : "Automatic if blank, e.g. A,B"
                }
                onChange={(e) =>
                  onChange({
                    chain_ids: e.target.value
                      ? e.target.value.split(/[,，]/).map((s) => s.trim())
                      : [],
                  })
                }
              />
            </label>
          )}
          {expert && polymer && (
            <div>
              <strong>{zh ? "残基修饰" : "Residue modifications"}</strong>
              <Hint label={zh ? "修饰说明" : "Modification help"}>
                {zh
                  ? "位置从 1 开始，CCD 编码描述替换后的残基。原生解析器可能规范化特定残基（例如 MSE→MET）。"
                  : "Positions start at 1. The CCD code identifies the modified residue. The native parser may normalize residues, including MSE to MET."}
              </Hint>
              {(value.modifications ?? []).map((m, i) => (
                <div className="inline-fields" key={i}>
                  <label>
                    {zh ? "位置" : "Position"}
                    <input
                      type="number"
                      min={1}
                      max={value.value.length || 5000}
                      value={m.position}
                      onChange={(e) =>
                        onChange({
                          modifications: value.modifications!.map((x, j) =>
                            j === i
                              ? { ...x, position: Number(e.target.value) }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    CCD
                    <input
                      value={m.ccd}
                      placeholder="CCD_MSE"
                      onChange={(e) =>
                        onChange({
                          modifications: value.modifications!.map((x, j) =>
                            j === i
                              ? { ...x, ccd: e.target.value.toUpperCase() }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        modifications: value.modifications!.filter(
                          (_, j) => j !== i,
                        ),
                      })
                    }
                  >
                    {zh ? "删除" : "Remove"}
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  onChange({
                    modifications: [
                      ...(value.modifications ?? []),
                      { position: 1, ccd: "CCD_" },
                    ],
                  })
                }
              >
                {zh ? "添加修饰" : "Add modification"}
              </button>
            </div>
          )}
          {(value.kind === "protein" || value.kind === "rna") && (
            <AssetPicker
              kind="msa"
              value={value.unpaired_msa ?? ""}
              onChange={(id) => onChange({ unpaired_msa: id || null })}
              language={language}
              label={zh ? "非配对 MSA" : "Unpaired MSA"}
            />
          )}
          {value.kind === "protein" && (
            <>
              <AssetPicker
                kind="msa"
                value={value.paired_msa ?? ""}
                onChange={(id) => onChange({ paired_msa: id || null })}
                language={language}
                label={zh ? "配对 MSA" : "Paired MSA"}
              />
              <AssetPicker
                kind="template"
                value={value.template_hits ?? ""}
                onChange={(id) => onChange({ template_hits: id || null })}
                language={language}
                label={zh ? "模板命中" : "Template hits"}
              />
            </>
          )}
        </details>
      )}
    </>
  );
}
