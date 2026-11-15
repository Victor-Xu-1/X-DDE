import type { Language } from "../types";
import { residueLabel, type Residue, type SelectionInfo } from "./protocol";
import type { ConfidenceInspection } from "./confidence-types";
import "./structure-inspection.css";

/** A projection of the renderer's display selection, never a constraint atom. */
export function StructureSelectionSummary({
  language,
  residues,
  selected,
  selection,
  confidence,
  nativeTokens = [],
  busy = false,
  onFocus,
  onClear,
}: {
  language: Language;
  residues: Residue[];
  selected: string[];
  selection: SelectionInfo | null;
  confidence?: ConfidenceInspection | null;
  nativeTokens?: number[];
  busy?: boolean;
  onFocus(): void;
  onClear(): void;
}) {
  const zh = language === "zh";
  const keys = new Set(selected);
  const rows = residues.filter((row) => keys.has(row.key));
  const positions = new Set(nativeTokens);
  const tokens =
    confidence?.tokens.filter((token) => positions.has(token.index)) ?? [];
  const polymerKeys = new Set(rows.map((row) => row.key));
  const covered = new Set(
    tokens
      .filter((token) => polymerKeys.has(token.residue))
      .map((token) => token.index),
  );
  const extraPositions = [...positions].filter(
    (index) => !covered.has(index),
  ).length;
  const positionLabel = (n: number) =>
    `${n} ${zh ? "个置信度位置" : n === 1 ? "confidence position" : "confidence positions"}`;
  const labels = [
    ...rows.map(residueLabel),
    ...tokens
      .filter((token) => !polymerKeys.has(token.residue))
      .map((token) => token.label),
  ];
  if (!selection && !rows.length && !positions.size) return null;
  const identity = selection
    ? `${selection.chain || (zh ? "未命名链" : "Unnamed chain")}:${selection.residue}`
    : rows.length === 1 && !extraPositions
      ? residueLabel(rows[0])
      : rows.length
        ? `${rows.length} ${zh ? "个残基" : rows.length === 1 ? "residue" : "residues"}${extraPositions ? " · " + positionLabel(extraPositions) : ""}`
        : positionLabel(positions.size);
  const atom = selection && selection.pick_mode !== "residue";
  const score =
    rows.length === 1 && !atom && !extraPositions
      ? confidence?.residueScores[rows[0].key]
      : undefined;
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
        {!selection &&
          (rows.length > 1 || extraPositions > 0) &&
          labels.length > 0 && (
            <span>
              {labels.slice(0, 3).join(" · ")}
              {labels.length > 3 ? " …" : ""}
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
