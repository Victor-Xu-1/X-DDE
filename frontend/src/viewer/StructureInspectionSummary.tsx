import type { Language } from "../types";
import { residueLabel, type Residue, type SelectionInfo } from "./protocol";
import "./structure-inspection.css";

/** A projection of the renderer's display selection, never a constraint atom. */
export function StructureSelectionSummary({
  language,
  residues,
  selected,
  selection,
  confidence,
  nativeSelectionCount = 0,
  busy = false,
  onFocus,
  onClear,
}: {
  language: Language;
  residues: Residue[];
  selected: string[];
  selection: SelectionInfo | null;
  confidence?: Record<string, number>;
  nativeSelectionCount?: number;
  busy?: boolean;
  onFocus(): void;
  onClear(): void;
}) {
  const zh = language === "zh";
  const keys = new Set(selected);
  const rows = residues.filter((row) => keys.has(row.key));
  const positions = Number.isSafeInteger(nativeSelectionCount)
    ? Math.max(0, nativeSelectionCount)
    : 0;
  if (!selection && !rows.length && !positions) return null;
  const identity = selection
    ? `${selection.chain || (zh ? "未命名链" : "Unnamed chain")}:${selection.residue}`
    : rows.length === 1
      ? residueLabel(rows[0])
      : rows.length
        ? `${rows.length} ${zh ? "个残基" : "residues"}`
        : `${positions} ${zh ? "个置信度位置" : positions === 1 ? "confidence position" : "confidence positions"}`;
  const atom = selection && selection.pick_mode !== "residue";
  const score =
    rows.length === 1 && !atom ? confidence?.[rows[0].key] : undefined;
  return (
    <div
      className="structure-selection-summary"
      role="group"
      aria-label={zh ? "当前结构选择" : "Current structure selection"}
    >
      <div className="structure-selection-description" role="status">
        <strong>{identity}</strong>
        {atom && (
          <span>
            {selection.atom} ({selection.element})
          </span>
        )}
        {rows.length > 1 && (
          <span>
            {rows.slice(0, 3).map(residueLabel).join(" · ")}
            {rows.length > 3 ? " …" : ""}
          </span>
        )}
        {typeof score === "number" &&
          Number.isFinite(score) &&
          score >= 0 &&
          score <= 100 && (
            <span
              title={
                zh
                  ? "残基的逐原子置信度均值"
                  : "Mean atom confidence for this residue"
              }
            >
              pLDDT {score.toFixed(1)}
            </span>
          )}
      </div>
      <div className="structure-selection-actions">
        <button
          type="button"
          className="secondary-button"
          aria-label={zh ? "定位当前选择" : "Focus current selection"}
          disabled={busy}
          onClick={onFocus}
        >
          {zh ? "定位" : "Focus"}
        </button>
        <button
          type="button"
          className="secondary-button"
          aria-label={zh ? "清除当前选择" : "Clear current selection"}
          disabled={busy}
          onClick={onClear}
        >
          {zh ? "清除" : "Clear"}
        </button>
      </div>
    </div>
  );
}
