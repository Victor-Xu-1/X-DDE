import { Hint } from "../guided/Hint";
import { entityInfo, ions } from "../guided/entities";
import { EntityOptions } from "../operations/EntityOptions";
import type { Component, Language } from "../types";

export function PredictionMolecularFields({
  item,
  id,
  role,
  language,
  expert,
  features,
  supportingFiles,
  onChange,
}: {
  item: Component;
  id: string;
  role: string;
  language: Language;
  expert: boolean;
  features: boolean;
  supportingFiles?: boolean;
  onChange(patch: Partial<Component>): void;
}) {
  const zh = language === "zh",
    i = zh ? 0 : 1,
    info = entityInfo[item.kind];
  return (
    <>
      <div className="field sequence-field">
        <span>
          <label htmlFor={id}>{info.field[i]}</label>
          <Hint label={role + (zh ? "输入说明" : " input help")}>
            {info.help[i]}
          </Hint>
        </span>
        {item.kind === "ion" && expert ? (
          <input
            id={id}
            value={item.value}
            maxLength={4}
            required
            pattern="[A-Za-z0-9]{1,4}"
            placeholder="MG, ZN, FE2…"
            onChange={(e) => onChange({ value: e.target.value.toUpperCase() })}
          />
        ) : item.kind === "ion" ? (
          <select
            id={id}
            value={item.value}
            onChange={(e) => onChange({ value: e.target.value })}
          >
            {ions.map(([code, cn, en]) => (
              <option key={code} value={code}>
                {zh ? cn : en} ({code})
              </option>
            ))}
          </select>
        ) : (
          <textarea
            id={id}
            required={!item.ligand_file}
            disabled={Boolean(item.ligand_file)}
            maxLength={5000}
            rows={item.kind === "ligand" ? 2 : 4}
            value={item.value}
            spellCheck={false}
            placeholder={info.placeholder[i]}
            onChange={(e) => onChange({ value: e.target.value })}
          />
        )}
      </div>
      <EntityOptions
        value={item}
        onChange={onChange}
        language={language}
        expert={expert}
        features={features}
        supportingFiles={supportingFiles}
      />
    </>
  );
}
