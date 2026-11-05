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
  onChange(value: Mol1Settings): void;
  components: Component[];
  onComponents: Dispatch<SetStateAction<Component[]>>;
  language: Language;
  entityKeys?: WeakMap<Component, string>;
}) {
  const zh = language === "zh";
  const editing = usePredictionEntityState(onComponents, entityKeys);
  const update = (change: Partial<Mol1Settings>) =>
    onChange({ ...value, ...change });
  return (
    <>
      <label className="field">
        {zh ? "序列进化信息" : "Sequence evolutionary information"}
        <select
          value={value.feature_mode}
          onChange={(e) => {
            if (e.target.value === "none")
              editing.updateAll({
                paired_msa: null,
                unpaired_msa: null,
                template_hits: null,
              });
            update({
              feature_mode: e.target.value as Mol1Settings["feature_mode"],
              ...(e.target.value === "none"
                ? {
                    use_template: false,
                    use_rna_msa: false,
                    allow_network: false,
                  }
                : {}),
            });
          }}
        >
          <option value="search">
            {zh ? "检索 MSA · 推荐" : "Search MSAs · recommended"}
          </option>
          <option value="uploaded">
            {zh ? "使用上传的 MSA" : "Use uploaded MSAs"}
          </option>
          <option value="none">{zh ? "不使用 MSA" : "No MSA"}</option>
        </select>
      </label>
      {value.feature_mode !== "none" && (
        <label>
          <input
            type="checkbox"
            checked={value.allow_network}
            onChange={(e) => update({ allow_network: e.target.checked })}
          />
          {zh
            ? "允许本任务将序列发送到原生 MSA 服务，并获取模板结构"
            : "Allow this task to send sequences to the native MSA service and retrieve template structures"}
        </label>
      )}
      {value.feature_mode !== "none" && (
        <div className="field-grid">
          <label>
            <input
              type="checkbox"
              checked={value.use_template}
              onChange={(e) => {
                update({ use_template: e.target.checked });
                if (!e.target.checked)
                  editing.updateAll({ template_hits: null });
              }}
            />
            {zh ? "使用结构模板" : "Use structural templates"}
          </label>
          {components.some((component) => component.kind === "rna") && (
            <label>
              <input
                type="checkbox"
                checked={value.use_rna_msa}
                onChange={(e) => update({ use_rna_msa: e.target.checked })}
              />
              {zh ? "上传并使用 RNA MSA" : "Use uploaded RNA MSAs"}
            </label>
          )}
        </div>
      )}
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
