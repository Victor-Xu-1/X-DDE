import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { MoleculeImage } from "../presentation/MoleculeImage";
import type { Language } from "../types";
import { assetDownloadUrl } from "../research/asset-download";
import type { BoltzComponent } from "./boltz-inputs";
import { BoltzMsaInput } from "./BoltzMsaInput";

export interface BoltzInputRow {
  // Editable chain labels are part of the job; these identifiers belong only to the form.
  key: string;
  revision: number;
  component: BoltzComponent;
}

export function BoltzInputs({
  rows,
  onRows,
  language,
  onMsaVerified,
}: {
  rows: BoltzInputRow[];
  onRows(update: (previous: BoltzInputRow[]) => BoltzInputRow[]): void;
  language: Language;
  onMsaVerified?(chain: string, key: string): void;
}) {
  const zh = language === "zh";
  function change(
    owner: BoltzInputRow,
    patch: Partial<BoltzComponent>,
    resetPicker = false,
  ) {
    onRows((previous) =>
      previous.map((row) =>
        row.key === owner.key &&
        row.revision === owner.revision &&
        (!patch.source ||
          !previous.some(
            (other) => other.key !== row.key && other.component.source,
          ))
          ? {
              ...row,
              revision: row.revision + Number(resetPicker),
              component: { ...row.component, ...patch },
            }
          : row,
      ),
    );
  }
  return (
    <div className="scientific-input-grid">
      {rows.map((row) => {
        const { component } = row;
        return (
          <div key={row.key} className="scientific-component-input">
            <div className="inline-fields">
              <label>
                {zh ? "分子类型" : "Molecular type"}
                <select
                  value={component.kind}
                  onChange={(e) =>
                    change(
                      row,
                      {
                        kind: e.target.value,
                        value: "",
                        source: null,
                        msa: null,
                        msa_mode:
                          e.target.value === "protein" ? "provided" : null,
                      },
                      true,
                    )
                  }
                >
                  <option value="protein">{zh ? "蛋白" : "Protein"}</option>
                  <option value="ligand">
                    {zh ? "小分子" : "Small molecule"}
                  </option>
                  <option value="rna">RNA</option>
                  <option value="dna">DNA</option>
                </select>
              </label>
              <label>
                {zh ? "链编号" : "Chain"}
                <input
                  maxLength={8}
                  value={component.id}
                  onChange={(e) =>
                    change(row, { id: e.target.value, msa: null }, true)
                  }
                />
              </label>
            </div>
            {component.kind === "ligand" &&
              !rows.some(
                (other) => other.key !== row.key && other.component.source,
              ) && (
                <ReferencePicker
                  key={row.revision}
                  kind="ligand"
                  value={component.source ?? null}
                  onChange={(value) =>
                    change(row, { source: value, value: "" })
                  }
                  language={language}
                  label={zh ? "上传小分子结构" : "Upload molecular structure"}
                  allowedSuffixes={[".sdf", ".mol"]}
                />
              )}
            <label>
              {component.kind === "ligand"
                ? "SMILES"
                : zh
                  ? "序列"
                  : "Sequence"}
              <textarea
                rows={component.kind === "ligand" ? 2 : 5}
                value={component.value}
                onChange={(e) =>
                  change(
                    row,
                    {
                      source: null,
                      value: e.target.value.replace(/\s/g, ""),
                      msa: null,
                    },
                    true,
                  )
                }
              />
            </label>
            {component.kind === "protein" && (
              <BoltzMsaInput
                key={row.revision}
                chain={component.id}
                sequence={component.value}
                value={component.msa ?? null}
                mode={component.msa_mode ?? "provided"}
                language={language}
                onModeChange={(msa_mode) =>
                  change(row, { msa_mode, msa: null }, true)
                }
                onChange={(msa) => change(row, { msa })}
                onVerified={(key) => onMsaVerified?.(component.id, key)}
              />
            )}
            {component.kind === "ligand" &&
              (component.value || component.source) && (
                <MoleculeImage
                  source={
                    component.source
                      ? {
                          url: assetDownloadUrl(
                            component.source.asset_id,
                            component.source.record,
                          ),
                        }
                      : { smiles: component.value }
                  }
                  language={language}
                  label={zh ? "本次输入分子" : "Entered molecule"}
                />
              )}
            {rows.length > 1 && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  onRows((previous) =>
                    previous.filter((item) => item.key !== row.key),
                  )
                }
              >
                {zh ? "移除此组分" : "Remove component"}
              </button>
            )}
          </div>
        );
      })}
      {rows.length < 8 && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            const key = crypto.randomUUID();
            onRows((previous) => [
              ...previous,
              {
                key,
                revision: 0,
                component: {
                  id: String.fromCharCode(65 + previous.length),
                  kind: "protein",
                  value: "",
                  msa_mode: "provided",
                },
              },
            ]);
          }}
        >
          {zh ? "添加一个组分" : "Add component"}
        </button>
      )}
    </div>
  );
}
