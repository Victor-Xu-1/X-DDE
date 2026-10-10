import { useEffect, useRef, useState } from "react";
import type { Language } from "../types";
import "./sequence-track.css";
import { DownloadOutlined } from "@ant-design/icons";
import { downloadBlob } from "./visual-export";
import { SequencePositions } from "./SequencePositions";
export interface SequenceRegion {
  start: number;
  end: number;
  label: string;
}
/** Positions are 1-based input sequence positions, never inferred PDB/IMGT numbering. */
export function SequenceTrack({
  sequence,
  language,
  label,
  regions = [],
  onSelect,
  selectedPosition,
  unit = "aa",
}: {
  sequence: string;
  language: Language;
  label: string;
  regions?: readonly SequenceRegion[];
  onSelect?(position: number): void;
  selectedPosition?: number | null;
  unit?: "aa" | "nt" | "positions";
}) {
  const zh = language === "zh";
  const [selection, setSelection] = useState({
    sequence,
    label,
    position: null as number | null,
  });
  const scroll = useRef<HTMLDivElement>(null);
  const requested =
    selectedPosition !== undefined
      ? selectedPosition
      : selection.sequence === sequence && selection.label === label
        ? selection.position
        : null;
  const position =
    requested != null &&
    Number.isInteger(requested) &&
    requested >= 1 &&
    requested <= sequence.length
      ? requested
      : null;
  function select(position: number) {
    setSelection({ sequence, label, position });
    onSelect?.(position);
  }
  useEffect(() => {
    if (position != null)
      scroll.current
        ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [position, sequence]);
  const selectedRegion = regions.find(
    (region) =>
      position != null && position >= region.start && position <= region.end,
  );
  return (
    <section className="sequence-track" aria-label={label}>
      <header>
        <h3>{label}</h3>
        <span>
          {sequence.length}{" "}
          {unit === "positions" ? (zh ? "个位置" : "positions") : unit}
        </span>
        <button
          type="button"
          className="visual-export-button"
          aria-label={zh ? "下载此序列 FASTA" : "Download this sequence FASTA"}
          onClick={() =>
            downloadBlob(
              new Blob(
                [
                  ">" +
                    label.replace(/[\r\n]/g, " ") +
                    "\n" +
                    (sequence.match(/.{1,80}/g)?.join("\n") ?? "") +
                    "\n",
                ],
                { type: "text/plain;charset=utf-8" },
              ),
              label + ".fasta",
            )
          }
        >
          <DownloadOutlined /> FASTA
        </button>
      </header>
      {regions.length > 0 && (
        <div
          className="sequence-region-map"
          aria-label={zh ? "序列区域图" : "Sequence region map"}
        >
          {regions.map((region) => (
            <button
              key={region.label + region.start}
              type="button"
              style={{
                left: ((region.start - 1) / sequence.length) * 100 + "%",
                width:
                  ((region.end - region.start + 1) / sequence.length) * 100 +
                  "%",
              }}
              title={region.label + " · " + region.start + "–" + region.end}
              onClick={() => select(region.start)}
            >
              {region.label}
            </button>
          ))}
        </div>
      )}
      <div className="sequence-track-scroll" ref={scroll}>
        <SequencePositions
          sequence={sequence}
          label={label}
          language={language}
          regions={regions}
          position={position}
          select={select}
        />
      </div>
      <details className="sequence-original">
        <summary>{zh ? "查看完整序列" : "View full sequence"}</summary>
        <pre className="sequence-cell">{sequence}</pre>
      </details>
      <footer>
        {position
          ? (zh ? "序列位置 " : "Sequence position ") +
            position +
            " · " +
            sequence[position - 1] +
            (selectedRegion ? " · " + selectedRegion.label : "")
          : zh
            ? "点击残基查看位置；编号以这条输入序列为准。"
            : "Select a position in this input. Use arrow keys to move, Home for the start and End for the end."}
      </footer>
    </section>
  );
}
