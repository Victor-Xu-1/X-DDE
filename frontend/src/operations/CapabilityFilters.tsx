import type { Language } from "../types";
import { modalities } from "./catalog";
import type { ModalityFilter } from "./filter";
export function CapabilityFilters({
  language,
  modality,
  onModality,
}: {
  language: Language;
  modality: ModalityFilter;
  onModality(value: ModalityFilter): void;
}) {
  const zh = language === "zh",
    index = zh ? 0 : 1;
  return (
    <div
      className="tool-groups modality-filters"
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
  );
}
