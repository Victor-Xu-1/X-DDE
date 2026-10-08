import { useEffect, useRef } from "react";
import type { Language } from "../types";
import type { EvaluationRow } from "./types";
import "./sequence-alignment.css";
export function SequenceAlignment({
  row,
  language,
  selectedPosition,
  onSelect,
}: {
  row: EvaluationRow;
  language: Language;
  selectedPosition: number | null;
  onSelect(position: number): void;
}) {
  const zh = language === "zh",
    scroll = useRef<HTMLDivElement>(null);
  const selected = row.numbering.find(
    (residue) => residue.source_position === selectedPosition,
  );
  useEffect(() => {
    if (selectedPosition != null)
      scroll.current
        ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selectedPosition]);
  return (
    <section
      className="sequence-alignment"
      aria-label={
        row.proposal
          ? zh
            ? "原始与建议序列比较"
            : "Original and proposed sequence comparison"
          : zh
            ? "输入序列与 CDR"
            : "Input sequence and CDRs"
      }
    >
      <header>
        <h3>{zh ? "序列与 CDR 对照" : "Sequence & CDR alignment"}</h3>
        <span>IMGT · {row.numbering.length} aa</span>
      </header>
      {row.proposal && (
        <p className="alignment-row-key">
          {zh
            ? "每列上方：原始序列 · 下方：修改建议"
            : "Each column: original above · proposal below"}
        </p>
      )}
      <div className="alignment-scroll" ref={scroll}>
        <div className="alignment-pairs">
          {row.numbering.map((residue) => {
            const selected = selectedPosition === residue.source_position;
            const originalLabel =
              (zh ? "原始" : "Original") +
              " · " +
              residue.source_position +
              " · " +
              residue.amino_acid;
            const location = `IMGT ${residue.number}${residue.insertion} · ${residue.region} · ${zh ? "原始位置" : "Source position"} ${residue.source_position}`;
            return (
              <div className="alignment-pair" key={residue.source_position}>
                <small>{residue.source_position}</small>
                <button
                  type="button"
                  className={
                    (residue.region !== "framework" ? "is-cdr " : "") +
                    (selected ? "is-selected" : "")
                  }
                  aria-label={originalLabel}
                  aria-pressed={selected}
                  title={location}
                  onClick={() => onSelect(residue.source_position)}
                >
                  {residue.amino_acid}
                </button>
                {row.proposal && (
                  <button
                    type="button"
                    className={
                      (residue.region !== "framework" ? "is-cdr " : "") +
                      (row.proposal[residue.source_position - 1] !==
                      residue.amino_acid
                        ? "is-modified "
                        : "") +
                      (selected ? "is-selected" : "")
                    }
                    aria-label={
                      (zh ? "建议" : "Proposal") +
                      " · " +
                      residue.source_position +
                      " · " +
                      row.proposal[residue.source_position - 1]
                    }
                    aria-pressed={selected}
                    title={
                      location +
                      " · " +
                      residue.amino_acid +
                      " → " +
                      row.proposal[residue.source_position - 1]
                    }
                    onClick={() => onSelect(residue.source_position)}
                  >
                    {row.proposal[residue.source_position - 1]}
                  </button>
                )}
              </div>
            );
          })}
        </div>
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
