import { PlusOutlined, CloseOutlined } from "@ant-design/icons";
import type { Dispatch, SetStateAction } from "react";
import { Hint } from "./Hint";
import { entityInfo } from "./entities";
import { translator } from "../i18n";
import type { TaskKind } from "./presets";
import type { Component, Language } from "../types";
import { PredictionEntityCard } from "../presentation/PredictionEntityCard";
import { PredictionMolecularFields } from "../presentation/PredictionMolecularFields";
import { predictionEntitySummary } from "../presentation/PredictionEntitySummary";
import { usePredictionEntityState } from "../presentation/PredictionEntityState";

export function MolecularInputs({
  items,
  onChange,
  language,
  expert,
  workflow,
  features = false,
  allowedKinds,
  showHeading = true,
  entityKeys,
  supportingFiles,
}: {
  items: Component[];
  onChange: Dispatch<SetStateAction<Component[]>>;
  language: Language;
  expert: boolean;
  workflow: TaskKind;
  features?: boolean;
  allowedKinds?: Component["kind"][];
  showHeading?: boolean;
  entityKeys?: WeakMap<Component, string>;
  supportingFiles?: boolean;
}) {
  const t = translator(language),
    zh = language === "zh",
    i = zh ? 0 : 1;
  const editing = usePredictionEntityState(onChange, entityKeys);
  const allowed: Component["kind"][] =
    allowedKinds ??
    (expert
      ? ["protein", "ligand", "dna", "rna", "ion"]
      : workflow === "nucleic"
        ? ["dna", "rna", "protein"]
        : workflow === "protein-complex"
          ? ["protein"]
          : []);
  const paired =
    workflow === "antibody" &&
    items.filter((x) => x.kind === "protein").length >= 3;
  return (
    <section className="molecular-inputs">
      {showHeading && (
        <h3>{zh ? "2 · 填写分子信息" : "2 · Enter molecular inputs"}</h3>
      )}
      {workflow === "antibody" && (
        <p className="small muted">
          {zh
            ? "先填抗原，再填已有的抗体序列。完整重链/轻链请分开填写。"
            : "Enter the antigen first, followed by the existing antibody. Enter heavy and light chains separately."}
        </p>
      )}
      {workflow === "nucleic" && items[0] && (
        <div className="nucleic-choice">
          <span>{zh ? "第一条链" : "First strand"}</span>
          {(["rna", "dna"] as const).map((kind) => (
            <label key={kind}>
              <input
                type="radio"
                name={editing.key(items[0]) + "-nucleic-type"}
                checked={items[0].kind === kind}
                onChange={() => editing.update(editing.key(items[0]), { kind })}
              />
              {kind.toUpperCase()}
            </label>
          ))}
        </div>
      )}
      <div className="molecular-fields">
        {items.map((item, index) => {
          const id = editing.key(item);
          const role =
            workflow === "antibody" && item.kind === "protein"
              ? (index === 0
                  ? ["抗原", "Antigen"]
                  : index === 1
                    ? paired
                      ? ["抗体重链", "Antibody heavy chain"]
                      : [
                          "抗体（VHH / scFv / 重链）",
                          "Antibody (VHH / scFv / heavy chain)",
                        ]
                    : ["抗体轻链", "Antibody light chain"])[i]
              : entityInfo[item.kind].name[i];
          const removable =
            expert ||
            index >=
              (["complex", "protein-complex", "antibody"].includes(workflow)
                ? 2
                : 1);
          return (
            <PredictionEntityCard
              key={id}
              language={language}
              index={index}
              kind={item.kind}
              title={role + " " + (index + 1)}
              summary={predictionEntitySummary(item, language)}
              controls={
                expert || removable || item.count > 1 ? (
                  <>
                    {expert ? (
                      <label className="prediction-entity-copies">
                        {t("copies")}
                        <Hint
                          label={role + (zh ? "拷贝数说明" : " copies help")}
                        >
                          {zh
                            ? "相同组分在同一复合物中的份数，通常为 1；这不是批量预测次数。"
                            : "Identical copies in one complex, usually 1. This is not the number of prediction jobs."}
                        </Hint>
                        <select
                          aria-label={t("copies") + " " + (index + 1)}
                          value={item.count}
                          onChange={(e) =>
                            editing.update(id, {
                              count: Number(e.target.value),
                            })
                          }
                        >
                          {[1, 2, 3, 4].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      item.count > 1 && <small>{item.count} ×</small>
                    )}
                    {removable && (
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={t("remove") + " " + (index + 1)}
                        disabled={items.length === 1}
                        onClick={() => editing.remove(id)}
                      >
                        <CloseOutlined />
                      </button>
                    )}
                  </>
                ) : undefined
              }
            >
              <PredictionMolecularFields
                item={item}
                id={id + "-input"}
                role={role}
                language={language}
                expert={expert}
                features={features}
                supportingFiles={supportingFiles}
                onChange={(patch) => editing.update(id, patch)}
              />
            </PredictionEntityCard>
          );
        })}
      </div>
      {workflow === "antibody" && !paired && (
        <button
          className="add-button"
          type="button"
          onClick={() => editing.add("protein")}
          disabled={items.length >= 8}
        >
          <PlusOutlined />
          {zh ? "我的抗体还有一条轻链" : "My antibody also has a light chain"}
        </button>
      )}
      {allowed.length > 0 && (
        <div className="add-components">
          <p className="small muted">
            {zh
              ? "体系还包含其他组分？按需添加。"
              : "Does the assembly include other components? Add them as needed."}
          </p>
          {allowed.map((kind) => (
            <button
              key={kind}
              className="add-button"
              type="button"
              disabled={items.length >= 8}
              onClick={() => editing.add(kind)}
            >
              <PlusOutlined />
              {entityInfo[kind].name[i]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
