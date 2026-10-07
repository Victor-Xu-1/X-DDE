import { StructureViewer } from "../viewer/StructureViewer";
import { Hint } from "../guided/Hint";
import { referenceUrl } from "./PartnerStep";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
export function BindingRegion({
  source,
  selected,
  other,
  title,
  onChange,
  language,
}: {
  source: MoleculeRef;
  selected: number[];
  other: number[];
  title: string;
  onChange(value: number[]): void;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <section className="proximity-binding-region" aria-label={title}>
      <div className="section-heading">
        <h3>{title}</h3>
        <span>
          {selected.length} {zh ? "个原子" : "atoms"}
        </span>
        <button
          type="button"
          className="text-button"
          onClick={() => onChange([])}
        >
          {zh ? "清空选择" : "Clear"}
        </button>
        <Hint
          label={zh ? "怎样选择结合端？" : "How to select the binding arm?"}
        >
          {zh
            ? "点选构成这一结合端的完整、连续片段。两端不得重叠，连接区域保留在两端之外；提交时会复核完整化学图。"
            : "Select one complete connected binding region. Keep the two regions separate and the linker outside both. The complete chemical correspondence is checked at execution."}
        </Hint>
      </div>
      <StructureViewer
        urls={[referenceUrl(source)]}
        records={[source.record]}
        language={language}
        selectionMode="atom"
        highlightedAtoms={selected}
        onAtomSelected={(selection) => {
          const index = selection?.source_atom_index;
          if (typeof index !== "number" || other.includes(index)) return;
          onChange(
            selected.includes(index)
              ? selected.filter((i) => i !== index)
              : [...selected, index].sort((a, b) => a - b),
          );
        }}
      />
    </section>
  );
}
