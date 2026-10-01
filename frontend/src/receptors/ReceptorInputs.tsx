import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type { Selection } from "./types";
export const emptyReceptorSelection = (): Selection => ({
  model_index: 0,
  chains: [],
  profile: "unspecified",
  chain_pairs: [],
  residue_pairs: [],
});
export interface ReceptorRow {
  key: number;
  structure: MoleculeRef | null;
  selection: Selection;
  raw: string;
}

export function ReceptorInputs({
  language,
  rows,
  expert,
  update,
  onRemove,
  onAdd,
}: {
  language: Language;
  rows: ReceptorRow[];
  expert: boolean;
  update(key: number, change: Partial<ReceptorRow>): void;
  onRemove(key: number): void;
  onAdd(): void;
}) {
  const zh = language === "zh";
  return (
    <>
      {rows.map((row, index) => (
        <section
          className="receptor-input"
          key={row.key}
          aria-label={zh ? `受体 ${index + 1}` : `Receptor ${index + 1}`}
        >
          <div className="receptor-row-heading">
            <strong>
              {zh ? "受体" : "Receptor"} {index + 1}
            </strong>
            <button
              className="secondary-button"
              type="button"
              disabled={rows.length <= 2}
              onClick={() => onRemove(row.key)}
            >
              {zh ? "移除此结构" : "Remove structure"}
            </button>
          </div>
          <ReferencePicker
            kind="structure"
            allowedSuffixes={[".pdb", ".cif"]}
            value={row.structure}
            onChange={(structure) =>
              update(row.key, {
                structure,
                selection: emptyReceptorSelection(),
                raw: JSON.stringify(emptyReceptorSelection(), null, 2),
              })
            }
            language={language}
            label={
              zh
                ? `受体 ${index + 1} 结构版本`
                : `Receptor ${index + 1} structural version`
            }
          />
          <label className="field">
            {zh ? "结构来源" : "Structure source"}
            <select
              value={row.selection.profile}
              onChange={(e) => {
                const selection = {
                  ...row.selection,
                  profile: e.target.value as Selection["profile"],
                };
                update(row.key, {
                  selection,
                  raw: JSON.stringify(selection, null, 2),
                });
              }}
            >
              <option value="unspecified">
                {zh ? "来源未声明" : "Source not declared"}
              </option>
              <option value="experimental">
                {zh ? "实验结构" : "Experimental structure"}
              </option>
              <option value="predicted">
                {zh ? "预测结构" : "Predicted structure"}
              </option>
            </select>
          </label>
          {expert && (
            <label className="field">
              {zh
                ? `受体 ${index + 1} 的模型、链与对应参数`
                : `Model, chain and correspondence settings for receptor ${index + 1}`}
              <textarea
                rows={8}
                value={row.raw}
                onChange={(e) => update(row.key, { raw: e.target.value })}
              />
            </label>
          )}
        </section>
      ))}
      <button
        className="secondary-button"
        type="button"
        disabled={rows.length >= 16}
        onClick={onAdd}
      >
        {zh ? "添加一个受体结构" : "Add receptor structure"}
      </button>
    </>
  );
}
