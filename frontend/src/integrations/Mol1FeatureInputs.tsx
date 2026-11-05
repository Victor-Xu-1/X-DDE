import { PredictionFeatureSettings } from "../presentation/PredictionFeatureSettings";
import type { Dispatch, SetStateAction } from "react";
import { AssetPicker } from "../operations/AssetPicker";
import { usePredictionEntityState } from "../presentation/PredictionEntityState";
import type { Component, Language } from "../types";
import type { Mol1Settings } from "./mol1-settings";

export function Mol1FeatureInputs({
  value,
  onChange,
  components,
  onComponents,
  language,
  entityKeys,
}: {
  value: Mol1Settings;
  onChange: Dispatch<SetStateAction<Mol1Settings>>;
  components: Component[];
  onComponents: Dispatch<SetStateAction<Component[]>>;
  language: Language;
  entityKeys?: WeakMap<Component, string>;
}) {
  const zh = language === "zh";
  const editing = usePredictionEntityState(onComponents, entityKeys);
  const update = (change: Partial<Mol1Settings>) =>
    onChange((previous) => ({ ...previous, ...change }));
  return (
    <>
      <PredictionFeatureSettings
        value={value}
        language={language}
        contextKey={JSON.stringify([
          value,
          components.map((item) => [
            item.kind,
            item.value,
            item.count,
            item.chain_ids,
            item.modifications,
            item.ligand_file,
          ]),
        ])}
        hasRna={components.some((item) => item.kind === "rna")}
        clearNotice={
          components.some(
            (item) =>
              item.unpaired_msa || item.paired_msa || item.template_hits,
          )
            ? zh
              ? "保存后将清空已选的 MSA 和模板；原文件仍可在历史文件中选择。"
              : "Saving clears selected MSA and template files. Original files remain available in Historical files."
            : undefined
        }
        onChange={(policy) => {
          if (policy.feature_mode === "none")
            editing.updateAll({
              paired_msa: null,
              unpaired_msa: null,
              template_hits: null,
            });
          else if (value.use_template && !policy.use_template)
            editing.updateAll({ template_hits: null });
          update({ ...policy });
        }}
      />
      {value.feature_mode === "none" && (
        <p className="field-help">
          {zh
            ? "自然蛋白的单序列预测通常更不可靠，请优先提供或检索 MSA。"
            : "Single-sequence predictions of natural proteins are generally less reliable; prefer supplied or searched MSAs."}
        </p>
      )}
      {value.feature_mode !== "none" &&
        components.map((component, index) => {
          const id = editing.key(component);
          const context = JSON.stringify([
            id,
            component.kind,
            component.value,
            component.chain_ids,
            component.modifications,
          ]);
          return (component.kind === "protein" &&
            value.feature_mode === "uploaded") ||
            (component.kind === "rna" && value.use_rna_msa) ? (
            <section key={id}>
              <h3>
                {component.chain_ids?.join(",") ||
                  `${zh ? "组分" : "Component"} ${index + 1}`}
              </h3>
              <AssetPicker
                key={"unpaired:" + context}
                kind="msa"
                label={zh ? "非配对 A3M" : "Unpaired A3M"}
                value={component.unpaired_msa ?? ""}
                onChange={(file) =>
                  editing.update(id, { unpaired_msa: file || null })
                }
                language={language}
              />
              {component.kind === "protein" && (
                <>
                  <AssetPicker
                    key={"paired:" + context}
                    kind="msa"
                    label={zh ? "配对 A3M（可选）" : "Paired A3M (optional)"}
                    value={component.paired_msa ?? ""}
                    onChange={(file) =>
                      editing.update(id, { paired_msa: file || null })
                    }
                    language={language}
                  />
                  {value.use_template && (
                    <AssetPicker
                      key={"template:" + context}
                      kind="template"
                      label={zh ? "结构模板命中" : "Structural template hits"}
                      value={component.template_hits ?? ""}
                      onChange={(file) =>
                        editing.update(id, { template_hits: file || null })
                      }
                      language={language}
                    />
                  )}
                </>
              )}
            </section>
          ) : null;
        })}
    </>
  );
}

export function validMol1Features(
  value: Mol1Settings,
  components: Component[],
) {
  if (value.feature_mode === "search" && !value.allow_network) return false;
  if (
    value.use_rna_msa &&
    components.some(
      (component) => component.kind === "rna" && !component.unpaired_msa,
    )
  )
    return false;
  if (value.feature_mode !== "uploaded") return true;
  return components.every((component) =>
    component.kind === "protein"
      ? Boolean(
          (component.unpaired_msa || component.paired_msa) &&
          (!value.use_template || component.template_hits),
        )
      : component.kind !== "rna" ||
        !value.use_rna_msa ||
        Boolean(component.unpaired_msa),
  );
}
