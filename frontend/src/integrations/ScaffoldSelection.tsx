import { useState } from "react";
import { StructureViewer } from "../viewer/StructureViewer";
import type { SceneInfo } from "../viewer/protocol";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type { ScientificPayload } from "./types";

export function ScaffoldSelection({
  source,
  language,
  payload,
  onChange,
}: {
  source: MoleculeRef;
  language: Language;
  payload: ScientificPayload;
  onChange(value: Partial<ScientificPayload>): void;
}) {
  const zh = language === "zh",
    [scene, setScene] = useState<SceneInfo | null>(null);
  const selected = (payload.scaffold_residues ?? []) as string[];
  return (
    <section className="scaffold-selection">
      <h3>
        {zh
          ? "选择框架中要重新设计的残基"
          : "Select framework residues to redesign"}
      </h3>
      <label className="field">
        {zh ? "框架链" : "Framework chain"}
        <select
          value={String(payload.scaffold_chain ?? "")}
          onChange={(e) =>
            onChange({ scaffold_chain: e.target.value, scaffold_residues: [] })
          }
        >
          <option value="">{zh ? "选择一条链" : "Choose one chain"}</option>
          {scene?.chains.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <StructureViewer
        urls={[`/api/assets/${source.asset_id}`]}
        language={language}
        selectionMode="residue"
        onSceneLoaded={setScene}
        onAtomSelected={(s) => {
          const id = s?.identity;
          if (!id || id.is_ligand || id.chain !== payload.scaffold_chain)
            return;
          const key = `${id.chain}${id.number}${id.insertion_code}`;
          onChange({
            scaffold_residues: selected.includes(key)
              ? selected.filter((r) => r !== key)
              : [...selected, key],
          });
        }}
      />
      <div className="selection-chips">
        {selected.map((r) => (
          <button
            type="button"
            key={r}
            onClick={() =>
              onChange({ scaffold_residues: selected.filter((x) => x !== r) })
            }
          >
            {r} ×
          </button>
        ))}
      </div>
    </section>
  );
}
