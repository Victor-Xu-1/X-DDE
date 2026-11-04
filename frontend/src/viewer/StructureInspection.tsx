import type { Language } from "../types";
import { residueLabel, type Residue, type ViewerOptions } from "./protocol";
import type { ResidueSelectionMode } from "./residue-selection";
import { confidenceColor } from "./confidence-types";
import "./structure-inspection.css";
const names =
  "ALA ARG ASN ASP CYS GLN GLU GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL".split(
    " ",
  );
const letters = "ARNDCQEGHILKMFPSTWYV";
const residueLetter = (name: string) =>
  names.includes(name)
    ? letters[names.indexOf(name)]
    : ["DA", "DC", "DG", "DT", "DU"].includes(name)
      ? name.slice(1)
      : ["A", "C", "G", "U", "T"].includes(name)
        ? name
        : "X";

export function StructureDisplayControls({
  language,
  options,
  onChange,
}: {
  language: Language;
  options: ViewerOptions;
  onChange(value: Partial<ViewerOptions>): void;
}) {
  const zh = language === "zh";
  return (
    <div
      className="structure-display-controls"
      role="group"
      aria-label={zh ? "结构显示" : "Structure display"}
    >
      {(
        [
          ["allAtoms", zh ? "全部原子" : "All atoms"],
          ["sideChains", zh ? "侧链" : "Side chains"],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          <span>{label}</span>
          <input
            type="checkbox"
            role="switch"
            checked={Boolean(options[key])}
            onChange={(event) => onChange({ [key]: event.target.checked })}
          />
        </label>
      ))}
    </div>
  );
}

export function StructureSequence({
  language,
  residues,
  selected,
  hiddenChains,
  onSelect,
  onClear,
  confidence,
  nativeSelectionCount = 0,
  compact = false,
}: {
  language: Language;
  residues: Residue[];
  selected: string[];
  hiddenChains: string[];
  onSelect(key: string, mode: ResidueSelectionMode): void;
  onClear(): void;
  confidence?: Record<string, number>;
  nativeSelectionCount?: number;
  compact?: boolean;
}) {
  const zh = language === "zh";
  const chains = [...new Set(residues.map((row) => row.chain))];
  const selectedKeys = new Set(selected);
  return (
    <section
      className={
        compact ? "structure-sequence is-compact" : "structure-sequence"
      }
      aria-label={zh ? "结构中的残基" : "Residues in structure"}
    >
      <header>
        <h3>
          {confidence
            ? zh
              ? "序列与残基置信度"
              : "Sequences and residue confidence"
            : zh
              ? "序列与结构"
              : "Sequence and structure"}
        </h3>
        <span role="status">
          {selected.length || nativeSelectionCount}{" "}
          {selected.length || !nativeSelectionCount
            ? zh
              ? "个残基已选"
              : selected.length === 1
                ? "residue selected"
                : "residues selected"
            : zh
              ? "个原子 token 已选"
              : nativeSelectionCount === 1
                ? "atom token selected"
                : "atom tokens selected"}
        </span>
        <button
          type="button"
          disabled={!selected.length && !nativeSelectionCount}
          onClick={onClear}
        >
          {zh ? "清除选择" : "Clear sequence selection"}
        </button>
      </header>
      <p>
        {zh
          ? "显示结构中实际存在的残基。Shift 点击选范围，Ctrl / ⌘ 点击增减选择。"
          : "Observed residues only. Shift-click selects a range; Ctrl / ⌘-click toggles one residue."}
      </p>
      {chains.map((chain) => (
        <div className="structure-sequence-chain" key={chain}>
          <strong>
            {zh ? "链 " : "Chain "}
            {chain || (zh ? "未命名" : "Unnamed")}
          </strong>
          <div
            className="structure-sequence-residues"
            role="group"
            aria-label={(zh ? "链 " : "Chain ") + chain}
          >
            {residues
              .filter((row) => row.chain === chain)
              .map((row, index, chainRows) => (
                <button
                  key={row.key}
                  type="button"
                  role="checkbox"
                  aria-checked={selectedKeys.has(row.key)}
                  aria-label={
                    residueLabel(row) +
                    (confidence?.[row.key] !== undefined
                      ? ` · pLDDT ${confidence[row.key].toFixed(1)}`
                      : "")
                  }
                  title={
                    residueLabel(row) +
                    (confidence?.[row.key] !== undefined
                      ? ` · pLDDT ${confidence[row.key].toFixed(1)} (${zh ? "逐原子置信度均值" : "mean atom confidence"})`
                      : "")
                  }
                  style={
                    confidence?.[row.key] !== undefined
                      ? {
                          borderBottomColor: confidenceColor(
                            confidence[row.key],
                          ),
                          borderBottomWidth: 3,
                        }
                      : undefined
                  }
                  disabled={hiddenChains.includes(chain)}
                  onClick={(event) =>
                    onSelect(
                      row.key,
                      event.shiftKey
                        ? "range"
                        : event.ctrlKey || event.metaKey
                          ? "toggle"
                          : "replace",
                    )
                  }
                >
                  <span>{residueLetter(row.resn)}</span>
                  {(!compact ||
                    index === 0 ||
                    index === chainRows.length - 1 ||
                    (index + 1) % 10 === 0 ||
                    row.icode) && (
                    <small>
                      {row.resi}
                      {row.icode}
                    </small>
                  )}
                </button>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}
