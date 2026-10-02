import { useState } from "react";
import { artifactUrl } from "../api";
import type { Language } from "../types";
import type { IdentityResult } from "../diffsbdd/types";
import { StructureViewer } from "../viewer/StructureViewer";
export function AtomSelection({
  job,
  identity,
  selected,
  onAtom,
  language,
}: {
  job: string;
  identity: IdentityResult;
  selected: number[];
  onAtom(index: number): void;
  language: Language;
}) {
  const zh = language === "zh",
    [page, setPage] = useState(0);
  const atoms = identity.atoms.filter((atom) => atom.selectable);
  return (
    <section>
      <StructureViewer
        urls={[artifactUrl(job, identity.molecule_artifact)]}
        language={language}
        selectionMode="atom"
        highlightedAtoms={selected}
        onAtomSelected={(selection) => {
          if (selection?.pick_mode === "distance") return;
          const atom = atoms.find(
            (value) => value.index === selection?.source_atom_index,
          );
          if (atom) onAtom(atom.index);
        }}
      />
      <div
        className="sequence-picker"
        role="group"
        aria-label={zh ? "当前区域原子" : "Active region atoms"}
      >
        {atoms.slice(page * 100, (page + 1) * 100).map((atom) => (
          <button
            type="button"
            key={atom.index}
            aria-pressed={selected.includes(atom.index)}
            title={`${atom.element} · ${atom.index + 1}`}
            onClick={() => onAtom(atom.index)}
          >
            {atom.index + 1} {atom.element}
          </button>
        ))}
      </div>
      {atoms.length > 100 && (
        <div className="task-actions">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            {zh ? "上一页原子" : "Previous atoms"}
          </button>
          <span>
            {page + 1} / {Math.ceil(atoms.length / 100)}
          </span>
          <button
            type="button"
            disabled={(page + 1) * 100 >= atoms.length}
            onClick={() => setPage(page + 1)}
          >
            {zh ? "下一页原子" : "Next atoms"}
          </button>
        </div>
      )}
      <p className="field-help">
        {zh ? "当前区域已选" : "Selected in this region"}:{" "}
        {selected.map((index) => index + 1).join(", ") || "—"}
      </p>
    </section>
  );
}
