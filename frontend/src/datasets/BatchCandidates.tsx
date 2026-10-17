import { MoleculeImage } from "../presentation/MoleculeImage";
import type { Language } from "../types";
import type { DatasetCandidate } from "./types";
import "./batch-candidates.css";

export function BatchCandidates({
  candidates,
  selected,
  onToggle,
  onSelection,
  language,
}: {
  candidates: DatasetCandidate[];
  selected: string[];
  onToggle(id: string): void;
  onSelection(ids: string[]): void;
  language: Language;
}) {
  const zh = language === "zh";
  const chosen = new Set(selected);
  return (
    <section aria-label={zh ? "选择对接分子" : "Docking candidate selection"}>
      <div className="dataset-field-heading batch-candidate-heading">
        <div>
          <strong>
            {zh ? "选择要对接的分子" : "Select molecules to dock"}
          </strong>
          <small className="batch-candidate-count">
            {zh ? "已选择" : "Selected"} {selected.length} / {candidates.length}
          </small>
        </div>
        <div className="batch-candidate-actions">
          <button
            type="button"
            disabled={candidates.every((row) => chosen.has(row.id))}
            onClick={() => onSelection(candidates.map((row) => row.id))}
          >
            {zh ? "选择全部" : "Select all"}
          </button>
          <button
            type="button"
            disabled={!selected.length}
            onClick={() => onSelection([])}
          >
            {zh ? "清除选择" : "Clear selection"}
          </button>
        </div>
      </div>
      <div className="dataset-candidate-select-grid">
        {candidates.map((row) => {
          const name = row.display_name || row.id;
          return (
            <label
              key={row.id}
              className={chosen.has(row.id) ? "selected" : ""}
            >
              <input
                type="checkbox"
                checked={chosen.has(row.id)}
                aria-label={`${zh ? "选择" : "Select"} ${name}`}
                onChange={() => onToggle(row.id)}
              />
              <MoleculeImage
                source={row.smiles ? { smiles: row.smiles } : null}
                language={language}
                label={name}
                compact
              />
              <strong>{name}</strong>
            </label>
          );
        })}
      </div>
    </section>
  );
}
