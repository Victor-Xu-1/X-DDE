import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { MoleculeImage } from "../presentation/MoleculeImage";
import type { Language } from "../types";
import type { ScientificPayload } from "./types";
import type { BoltzComponent } from "./boltz-inputs";
import { BoltzMsaInput } from "./BoltzMsaInput";

export function BoltzInputs({
  payload,
  onChange,
  language,
  onMsaVerified,
}: {
  payload: ScientificPayload;
  onChange(value: Partial<ScientificPayload>): void;
  language: Language;
  onMsaVerified?(chain: string, key: string): void;
}) {
  const zh = language === "zh";
  const components = payload.components as BoltzComponent[];
  return (
    <div className="scientific-input-grid">
      {components.map((component, index) => (
        <div key={index} className="scientific-component-input">
          <div className="inline-fields">
            <label>
              {zh ? "分子类型" : "Molecular type"}
              <select
                value={component.kind}
                onChange={(e) =>
                  onChange({
                    components: components.map((c, i) =>
                      i === index
                        ? {
                            ...c,
                            kind: e.target.value,
                            value: "",
                            source: null,
                            msa: null,
                            msa_mode:
                              e.target.value === "protein" ? "provided" : null,
                          }
                        : c,
                    ),
                  })
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
                  onChange({
                    components: components.map((c, i) =>
                      i === index ? { ...c, id: e.target.value } : c,
                    ),
                  })
                }
              />
            </label>
          </div>
          {component.kind === "ligand" &&
            !components.some((c, i) => i !== index && c.source) && (
              <ReferencePicker
                kind="ligand"
                value={component.source ?? null}
                onChange={(value) =>
                  onChange({
                    components: components.map((c, i) =>
                      i === index ? { ...c, source: value, value: "" } : c,
                    ),
                  })
                }
                language={language}
                label={zh ? "上传小分子结构" : "Upload molecular structure"}
                allowedSuffixes={[".sdf", ".mol"]}
              />
            )}
          <label>
            {component.kind === "ligand" ? "SMILES" : zh ? "序列" : "Sequence"}
            <textarea
              rows={component.kind === "ligand" ? 2 : 5}
              value={component.value}
              onChange={(e) =>
                onChange({
                  components: components.map((c, i) =>
                    i === index
                      ? {
                          ...c,
                          source: null,
                          value: e.target.value.replace(/\s/g, ""),
                          msa: null,
                        }
                      : c,
                  ),
                })
              }
            />
          </label>
          {component.kind === "protein" && (
            <BoltzMsaInput
              chain={component.id}
              sequence={component.value}
              value={component.msa ?? null}
              mode={component.msa_mode ?? "provided"}
              language={language}
              onModeChange={(msa_mode) =>
                onChange({
                  components: components.map((c, i) =>
                    i === index ? { ...c, msa_mode, msa: null } : c,
                  ),
                })
              }
              onChange={(msa) =>
                onChange({
                  components: components.map((c, i) =>
                    i === index ? { ...c, msa } : c,
                  ),
                })
              }
              onVerified={(key) => onMsaVerified?.(component.id, key)}
            />
          )}
          {component.kind === "ligand" &&
            (component.value || component.source) && (
              <MoleculeImage
                source={
                  component.source
                    ? {
                        url: `/api/assets/${component.source.asset_id}`,
                        record: component.source.record,
                      }
                    : { smiles: component.value }
                }
                language={language}
                label={zh ? "本次输入分子" : "Entered molecule"}
              />
            )}
          {components.length > 1 && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                onChange({
                  components: components.filter((_, i) => i !== index),
                })
              }
            >
              {zh ? "移除此组分" : "Remove component"}
            </button>
          )}
        </div>
      ))}
      {components.length < 8 && (
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            onChange({
              components: [
                ...components,
                {
                  id: String.fromCharCode(65 + components.length),
                  kind: "protein",
                  value: "",
                  msa_mode: "provided",
                },
              ],
            })
          }
        >
          {zh ? "添加一个组分" : "Add component"}
        </button>
      )}
    </div>
  );
}
