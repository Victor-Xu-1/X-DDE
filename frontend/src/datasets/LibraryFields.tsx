import type { Language } from "../types";
import type { InputPreview } from "./useTablePreview";

export function LibraryFields({
  language,
  preview,
  id,
  smiles,
  onId,
  onSmiles,
}: {
  language: Language;
  preview: InputPreview | null;
  id: string;
  smiles: string;
  onId(value: string): void;
  onSmiles(value: string): void;
}) {
  if (!preview?.table) return null;
  const zh = language === "zh";
  return (
    <div className="dataset-field-grid">
      <label className="field">
        {zh ? "货号或分子编号" : "Supplier or compound ID"}
        <select value={id} onChange={(e) => onId(e.target.value)}>
          {preview.columns.map((column) => (
            <option key={column}>{column}</option>
          ))}
        </select>
      </label>
      <label className="field">
        {zh ? "分子结构列" : "SMILES column"}
        <select value={smiles} onChange={(e) => onSmiles(e.target.value)}>
          {preview.columns.map((column) => (
            <option key={column}>{column}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
