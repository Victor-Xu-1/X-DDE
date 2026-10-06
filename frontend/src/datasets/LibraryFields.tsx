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
  if (!preview?.table && !preview?.sdf_properties) return null;
  const zh = language === "zh";
  return (
    <div className="dataset-field-grid">
      <label className="field">
        {zh ? "货号或分子编号" : "Supplier or compound ID"}
        <select value={id} onChange={(e) => onId(e.target.value)}>
          {!preview.table && (
            <option value="_Name">
              {zh ? "文件中每个分子的名称" : "Molecule title in the file"}
            </option>
          )}
          {(preview.sdf_properties ?? preview.columns).map((column) => (
            <option key={column}>{column}</option>
          ))}
        </select>
      </label>
      {preview.table && (
        <label className="field">
          {zh ? "分子结构列" : "SMILES column"}
          <select value={smiles} onChange={(e) => onSmiles(e.target.value)}>
            {preview.columns.map((column) => (
              <option key={column}>{column}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
