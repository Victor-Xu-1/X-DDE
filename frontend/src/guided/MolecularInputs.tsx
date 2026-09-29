import { PlusOutlined, CloseOutlined } from "@ant-design/icons";
import { Hint } from "./Hint";
import { translator } from "../i18n";
import type { Component, Language } from "../types";
export function MolecularInputs({
  items,
  onChange,
  language,
}: {
  items: Component[];
  onChange(items: Component[]): void;
  language: Language;
}) {
  const t = translator(language),
    zh = language === "zh";
  function update(index: number, patch: Partial<Component>) {
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }
  return (
    <>
      <h3>{zh ? "1 · 填写分子信息" : "1 · Enter molecular inputs"}</h3>
      {items.map((item, index) => (
        <div className="component-card" key={index}>
          <div className="component-heading">
            <strong>
              {item.kind === "protein" ? t("protein") : t("ligand")}
            </strong>
            <button
              className="icon-button"
              type="button"
              aria-label={t("remove") + " " + (index + 1)}
              disabled={items.length === 1}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              <CloseOutlined />
            </button>
          </div>
          <div className="field sequence-field">
            <span>
              <label htmlFor={"molecule-" + index}>
                {item.kind === "protein" ? t("sequence") : t("smiles")}
              </label>
              <Hint
                label={
                  (item.kind === "protein" ? t("sequence") : t("smiles")) +
                  (zh ? "说明" : " help")
                }
              >
                {item.kind === "protein"
                  ? zh
                    ? "粘贴蛋白质单字母序列或一条 FASTA。名称行、空格和换行会自动处理；多条序列请分别添加组分。"
                    : "Paste a protein sequence or one FASTA record. The header, spaces and line breaks are handled automatically. Add separate components for multiple records."
                  : zh
                    ? "SMILES 是化学结构的文本写法，可从结构编辑器或化合物表复制，例如乙醇 CCO。也可输入 CCD_ATP 等 PDB 化学组分编号。"
                    : "SMILES is a text representation of a chemical structure, available from structure editors or compound tables (ethanol: CCO). PDB component identifiers such as CCD_ATP are also accepted."}
              </Hint>
            </span>
            <textarea
              id={"molecule-" + index}
              required
              maxLength={5000}
              rows={item.kind === "protein" ? 4 : 2}
              value={item.value}
              spellCheck={false}
              placeholder={
                item.kind === "protein"
                  ? "ACDEFGHIKLMNPQRSTVWY…"
                  : "CCO  /  CCD_ATP"
              }
              onChange={(e) => update(index, { value: e.target.value })}
            />
          </div>
          <details className="input-options">
            <summary>{zh ? "同一组分有多份？" : "Multiple copies?"}</summary>
            <label>
              {t("copies")}
              <select
                value={item.count}
                onChange={(e) =>
                  update(index, { count: Number(e.target.value) })
                }
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <p className="small muted">
              {zh
                ? "通常保持 1；仅在复合物含相同的多条链或多个配体时更改。"
                : "Usually keep 1. Change only for identical copies in a complex."}
            </p>
          </details>
        </div>
      ))}
      <details className="input-options">
        <summary>
          {zh ? "添加其他蛋白或配体" : "Add another protein or ligand"}
        </summary>
        {(["protein", "ligand"] as const).map((kind) => (
          <button
            key={kind}
            className="add-button"
            type="button"
            disabled={items.length >= 8}
            onClick={() => onChange([...items, { kind, value: "", count: 1 }])}
          >
            <PlusOutlined /> {kind === "protein" ? t("protein") : t("ligand")}
          </button>
        ))}
      </details>
    </>
  );
}
