import { useState } from "react";
import type { Language } from "../types";
import type { EvaluationRow } from "./types";
import "./sequence-alignment.css";
export function SequenceAlignment({
  row,
  language,
}: {
  row: EvaluationRow;
  language: Language;
}) {
  const zh = language === "zh",
    [position, setPosition] = useState<number | null>(null);
  const residues = row.numbering,
    blocks = Array.from({ length: Math.ceil(residues.length / 30) }, (_, i) =>
      residues.slice(i * 30, (i + 1) * 30),
    );
  const selected = residues.find((r) => r.source_position === position);
  return (
    <section
      className="sequence-alignment"
      aria-label={
        zh ? "原始与建议序列比较" : "Original and proposed sequence comparison"
      }
    >
      <header>
        <h3>{zh ? "序列与 CDR 对照" : "Sequence & CDR alignment"}</h3>
        <span>IMGT · {residues.length} aa</span>
      </header>
      <div className="alignment-scroll">
        {blocks.map((block, index) => (
          <div className="alignment-block" key={index}>
            <span className="alignment-label">{zh ? "原始" : "Original"}</span>
            <div className="alignment-residues">
              {block.map((r) => (
                <button
                  key={r.source_position}
                  type="button"
                  className={
                    (r.region !== "framework" ? "is-cdr " : "") +
                    (position === r.source_position ? "is-selected" : "")
                  }
                  title={
                    "IMGT " +
                    r.number +
                    r.insertion +
                    " · " +
                    r.region +
                    " · " +
                    (zh ? "原始位置 " : "Source position ") +
                    r.source_position
                  }
                  onClick={() => setPosition(r.source_position)}
                >
                  <small>{r.source_position}</small>
                  {r.amino_acid}
                </button>
              ))}
            </div>
            {row.proposal && (
              <>
                <span className="alignment-label">
                  {zh ? "建议" : "Proposal"}
                </span>
                <div className="alignment-residues">
                  {block.map((r) => (
                    <button
                      key={r.source_position}
                      type="button"
                      className={
                        (r.region !== "framework" ? "is-cdr " : "") +
                        (row.proposal![r.source_position - 1] !== r.amino_acid
                          ? "is-modified "
                          : "") +
                        (position === r.source_position ? "is-selected" : "")
                      }
                      title={
                        "IMGT " +
                        r.number +
                        r.insertion +
                        " · " +
                        r.region +
                        " · " +
                        r.amino_acid +
                        " → " +
                        row.proposal![r.source_position - 1]
                      }
                      onClick={() => setPosition(r.source_position)}
                    >
                      <small>{r.source_position}</small>
                      {row.proposal![r.source_position - 1]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {selected && (
        <footer>
          {zh ? "原始位置 " : "Source position "}
          {selected.source_position} · IMGT {selected.number}
          {selected.insertion} · {selected.region} · {selected.amino_acid}
          {row.proposal && " → " + row.proposal[selected.source_position - 1]}
        </footer>
      )}
    </section>
  );
}
