import { PlusOutlined, CloseOutlined } from "@ant-design/icons";
import { Hint } from "./Hint";
import { entityInfo, ions } from "./entities";
import { translator } from "../i18n";
import type { TaskKind } from "./presets";
import type { Component, Language } from "../types";
import { EntityOptions } from "../operations/EntityOptions";
export function MolecularInputs({
  items,
  onChange,
  language,
  expert,
  workflow,
  features = false,
  allowedKinds,
  showHeading = true,
}: {
  items: Component[];
  onChange(items: Component[]): void;
  language: Language;
  expert: boolean;
  workflow: TaskKind;
  features?: boolean;
  allowedKinds?: Component["kind"][];
  showHeading?: boolean;
}) {
  const t = translator(language),
    zh = language === "zh",
    i = zh ? 0 : 1;
  function update(index: number, patch: Partial<Component>) {
    onChange(
      items.map((item, n) => (n === index ? { ...item, ...patch } : item)),
    );
  }
  function add(kind: Component["kind"]) {
    onChange([...items, { kind, value: kind === "ion" ? "MG" : "", count: 1 }]);
  }
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
      {workflow === "nucleic" && (
        <div className="nucleic-choice">
          <span>{zh ? "第一条链" : "First strand"}</span>
          {(["rna", "dna"] as const).map((kind) => (
            <label key={kind}>
              <input
                type="radio"
                name="nucleic-type"
                checked={items[0]?.kind === kind}
                onChange={() => update(0, { kind })}
              />
              {kind.toUpperCase()}
            </label>
          ))}
        </div>
      )}
      <div className="molecular-fields">
        {items.map((item, index) => {
          const info = entityInfo[item.kind];
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
              : info.name[i];
          return (
            <div className="component-card" key={index}>
              <div className="component-heading">
                <strong>
                  {role} {index + 1}
                </strong>
                {(expert ||
                  index >=
                    (["complex", "protein-complex", "antibody"].includes(
                      workflow,
                    )
                      ? 2
                      : 1)) && (
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={t("remove") + " " + (index + 1)}
                    disabled={items.length === 1}
                    onClick={() =>
                      onChange(items.filter((_, n) => n !== index))
                    }
                  >
                    <CloseOutlined />
                  </button>
                )}
              </div>
              <div className="field sequence-field">
                <span>
                  <label htmlFor={"molecule-" + index}>{info.field[i]}</label>
                  <Hint label={role + (zh ? "输入说明" : " input help")}>
                    {info.help[i]}
                  </Hint>
                </span>
                {item.kind === "ion" && expert ? (
                  <input
                    id={"molecule-" + index}
                    value={item.value}
                    maxLength={4}
                    required
                    pattern="[A-Za-z0-9]{1,4}"
                    placeholder="MG, ZN, FE2…"
                    onChange={(e) =>
                      update(index, { value: e.target.value.toUpperCase() })
                    }
                  />
                ) : item.kind === "ion" ? (
                  <select
                    id={"molecule-" + index}
                    value={item.value}
                    onChange={(e) => update(index, { value: e.target.value })}
                  >
                    {ions.map(([code, cn, en]) => (
                      <option key={code} value={code}>
                        {zh ? cn : en} ({code})
                      </option>
                    ))}
                  </select>
                ) : (
                  <textarea
                    id={"molecule-" + index}
                    required={!item.ligand_file}
                    disabled={Boolean(item.ligand_file)}
                    maxLength={5000}
                    rows={item.kind === "ligand" ? 2 : 4}
                    value={item.value}
                    spellCheck={false}
                    placeholder={info.placeholder[i]}
                    onChange={(e) => update(index, { value: e.target.value })}
                  />
                )}
              </div>
              <EntityOptions
                value={item}
                onChange={(patch) => update(index, patch)}
                language={language}
                expert={expert}
                features={features}
              />
              {expert && (
                <label className="copy-choice">
                  {t("copies")}{" "}
                  <Hint label={role + (zh ? "拷贝数说明" : " copies help")}>
                    {zh
                      ? "相同组分在同一复合物中的份数，通常为 1；这不是批量预测次数。"
                      : "Identical copies in one complex, usually 1. This is not the number of prediction jobs."}
                  </Hint>
                  <select
                    aria-label={t("copies") + " " + (index + 1)}
                    value={item.count}
                    onChange={(e) =>
                      update(index, { count: Number(e.target.value) })
                    }
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              )}
              {!expert && item.count > 1 && (
                <p className="small">
                  {zh ? "相同组分份数：" : "Identical copies: "}
                  {item.count}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {workflow === "antibody" && !paired && (
        <button
          className="add-button"
          type="button"
          onClick={() => add("protein")}
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
              onClick={() => add(kind)}
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
