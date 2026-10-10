import { useState } from "react";
import { SequenceTrack } from "../presentation/SequenceTrack";
import type { Language } from "../types";
import type { MoleculeRef } from "./types";
import { SequencePreviewError } from "./fasta-file";
import { useSequenceFile } from "./useSequenceFile";
import "./sequence-file-preview.css";

export function SequenceFilePreview({
  reference,
  language,
}: {
  reference: MoleculeRef;
  language: Language;
}) {
  const zh = language === "zh";
  const file = useSequenceFile(reference);
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState<number | null>(null);
  const [jump, setJump] = useState("");
  const current = file.records?.[index];
  const next = Number(jump);
  const valid =
    current &&
    Number.isInteger(next) &&
    next >= 1 &&
    next <= current.sequence.length;
  function go() {
    if (valid) setPosition(next);
  }
  if (file.error) {
    const code =
      file.error instanceof SequencePreviewError
        ? file.error.code
        : "unavailable";
    const message = {
      format: [
        "这份文件不是可预览的 FASTA 序列。请检查原始文件。",
        "This file is not a readable FASTA collection. Check the original file.",
      ],
      limit: [
        "预览支持不超过 2 MiB、500 条记录的 FASTA 文件。原始文件仍可下载。",
        "Preview supports FASTA files up to 2 MiB and 500 records. The original remains available to download.",
      ],
      identity: [
        "所选版本无法核验，请重新选择文件。",
        "The selected file version could not be verified. Select the file again.",
      ],
      unavailable: [
        "暂时无法读取序列，请重试。",
        "The sequence could not be loaded. Try again.",
      ],
    }[code][zh ? 0 : 1];
    return (
      <div role="alert">
        <p>{message}</p>
        <button onClick={file.retry}>{zh ? "重试" : "Retry"}</button>
      </div>
    );
  }
  if (!current)
    return <p role="status">{zh ? "正在读取序列…" : "Loading sequences…"}</p>;
  return (
    <div className="sequence-file-preview">
      <div className="sequence-file-controls">
        {file.records!.length > 1 && (
          <label>
            {zh ? "序列记录" : "Sequence record"}
            <select
              value={index}
              onChange={(event) => {
                setIndex(Number(event.target.value));
                setPosition(null);
                setJump("");
              }}
            >
              {file.records!.map((record, i) => (
                <option key={i} value={i}>
                  {i + 1} · {record.header}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {zh ? "跳转位置" : "Go to position"}
          <input
            type="number"
            min={1}
            max={current.sequence.length}
            step={1}
            value={jump}
            onChange={(event) => setJump(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                go();
              }
            }}
          />
        </label>
        <button type="button" disabled={!valid} onClick={go}>
          {zh ? "定位" : "Go"}
        </button>
      </div>
      <SequenceTrack
        key={index}
        sequence={current.sequence}
        label={current.header}
        language={language}
        unit="positions"
        selectedPosition={position}
        onSelect={setPosition}
      />
    </div>
  );
}
