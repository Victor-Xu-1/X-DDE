import { useState } from "react";
import type { Language } from "../types";
import "./sequence-track.css";
import { DownloadOutlined } from "@ant-design/icons";
import { downloadBlob } from "./visual-export";
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
  unit = "aa",
}: {
  sequence: string;
  language: Language;
  label: string;
  regions?: readonly SequenceRegion[];
  onSelect?(position: number): void;
  unit?: "aa" | "nt";
}) {
  const zh = language === "zh",
    [position, setPosition] = useState<number | null>(null);
  const selectedRegion = regions.find(
    (region) =>
      position != null && position >= region.start && position <= region.end,
  );
  return (
    <section className="sequence-track" aria-label={label}>
      <header>
        <h3>{label}</h3>
        <span>
          {sequence.length} {unit}
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
              onClick={() => setPosition(region.start)}
            >
              {region.label}
            </button>
          ))}
        </div>
      )}
      <div className="sequence-track-scroll">
        <div className="sequence-residue-grid">
          {Array.from(sequence).map((aa, index) => {
            const region = regions.find(
              (r) => index + 1 >= r.start && index + 1 <= r.end,
            );
            return (
              <button
                key={index}
                type="button"
                className={
                  (region ? "has-region " : "") +
                  (position === index + 1 ? "is-selected" : "")
                }
                aria-label={
                  label +
                  " · " +
                  (index + 1) +
                  " " +
                  aa +
                  (region ? " · " + region.label : "")
                }
                title={
                  index + 1 + " · " + aa + (region ? " · " + region.label : "")
                }
                onClick={() => {
                  setPosition(index + 1);
                  onSelect?.(index + 1);
                }}
              >
                <small>{index % 10 === 0 ? index + 1 : ""}</small>
                {aa}
              </button>
            );
          })}
        </div>
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
            : "Select a residue to inspect its position in this input sequence."}
      </footer>
    </section>
  );
}
