import type { RefObject } from "react";
import type { Language } from "../types";
import { modalities } from "./catalog";
import type { ModalityFilter, PurposeFilter } from "./filter";

const purposes = [
  ["all", "全部用途", "All purposes"],
  ["design", "设计", "Design"],
  ["structure", "结构预测", "Structures"],
  ["evaluate", "性质与评分", "Properties & scoring"],
  ["analyze", "结果分析", "Analysis"],
  ["search", "检索", "Search"],
  ["prepare", "输入准备", "Preparation"],
  ["system", "资源配置", "Resources"],
] as const;

export function CapabilityFilters({
  language,
  searchRef,
  query,
  onQuery,
  modality,
  onModality,
  purpose,
  onPurpose,
}: {
  language: Language;
  searchRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQuery(value: string): void;
  modality: ModalityFilter;
  onModality(value: ModalityFilter): void;
  purpose: PurposeFilter;
  onPurpose(value: PurposeFilter): void;
}) {
  const zh = language === "zh",
    index = zh ? 0 : 1;
  const selected = modalities.find((item) => item.id === modality);
  return (
    <div className="tool-filter">
      <label className="field">
        <span className="sr-only">
          {zh ? "搜索能力" : "Search capabilities"}
        </span>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={
            zh
              ? "我想做：性质、抗体设计、MSA、结构比较…"
              : "Find properties, antibody design, MSA, structure comparison…"
          }
        />
      </label>
      <div className="modality-filter-block">
        <span className="filter-label">
          {zh ? "药物形式" : "Drug modality"}
        </span>
        <div
          className="tool-groups"
          role="group"
          aria-label={zh ? "药物形式" : "Drug modality"}
        >
          <button
            type="button"
            aria-pressed={modality === "all"}
            className={modality === "all" ? "selected" : ""}
            onClick={() => onModality("all")}
          >
            {zh ? "全部能力" : "All capabilities"}
          </button>
          {modalities.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={modality === item.id}
              className={modality === item.id ? "selected" : ""}
              title={item.help[index]}
              onClick={() => onModality(item.id)}
            >
              {item.label[index]}
            </button>
          ))}
        </div>
        <p className="modality-help" aria-live="polite">
          {selected
            ? selected.help[index]
            : zh
              ? "类别可以重叠；通用导入、资源管理和研究计划适用于各类研究。具体支持范围请查看能力说明。"
              : "Categories overlap. Shared import, resources and research plans apply across modalities. Each tool describes its supported scope."}
        </p>
      </div>
      <label className="tool-purpose">
        <span className="filter-label">
          {zh ? "研究用途" : "Research purpose"}
        </span>
        <select
          value={purpose}
          onChange={(event) => onPurpose(event.target.value as PurposeFilter)}
        >
          {purposes.map(([id, cn, en]) => (
            <option key={id} value={id}>
              {zh ? cn : en}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
