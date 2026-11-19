import { MoleculeImage } from "../presentation/MoleculeImage";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import { ScaffoldCell, StructuralAlertCell } from "./LibraryInspectionCells";
import type { LibraryScreenResult, ScreenRow } from "./screen-types";

export function LibraryScreenSelection({
  row,
  result,
  language,
  onPrepare,
}: {
  row: ScreenRow;
  result: LibraryScreenResult;
  language: Language;
  onPrepare?(
    reference: MoleculeRef,
    label: string,
    trigger: HTMLButtonElement,
  ): void;
}) {
  const zh = language === "zh";
  const label = `${zh ? "原始分子" : "Input molecule"} #${row.record + 1}`;
  const smiles = row.descriptors?.smiles;
  const source = smiles ? { smiles } : null;
  return (
    <section
      className="library-screen-selection"
      aria-label={zh ? "所选筛选分子" : "Selected screening molecule"}
    >
      <header>
        <h4>{label}</h4>
        {row.reference && onPrepare && (
          <button
            className="secondary-button"
            type="button"
            onClick={(event) =>
              onPrepare(row.reference!, label, event.currentTarget)
            }
          >
            {zh ? "准备分子" : "Prepare molecule"}
          </button>
        )}
      </header>
      <MoleculeImage source={source} language={language} label={label} />
      <div className="library-screen-record-details">
        {result.options?.alert_policy &&
          result.options.alert_policy !== "off" && (
            <StructuralAlertCell row={row} language={language} />
          )}
        {result.scaffold_groups && (
          <ScaffoldCell
            row={row}
            groups={result.scaffold_groups}
            language={language}
          />
        )}
        {(row.descriptors?.fragments ?? 0) > 1 && (
          <small>{zh ? "包含多片段" : "Multiple fragments"}</small>
        )}
        {smiles && (
          <details>
            <summary>SMILES</summary>
            <code>{smiles}</code>
          </details>
        )}
      </div>
    </section>
  );
}
