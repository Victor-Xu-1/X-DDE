import { useState } from "react";
import { SequenceTrack } from "../presentation/SequenceTrack";
import type { Language } from "../types";

export function CandidateChainComparison({
  chain,
  sequence,
  reference,
  recordName,
  referenceName,
  language,
}: {
  chain: string;
  sequence: string;
  reference?: string;
  recordName: string;
  referenceName: string;
  language: Language;
}) {
  const zh = language === "zh";
  const [showReference, setShowReference] = useState(false);
  const [position, setPosition] = useState<number | null>(null);
  const comparable = Boolean(reference && reference.length === sequence.length);
  const changes =
    comparable && reference
      ? Array.from(sequence).flatMap((aa, index) =>
          aa === reference[index]
            ? []
            : [
                {
                  position: index + 1,
                  label: reference[index] + (index + 1) + aa,
                },
              ],
        )
      : [];
  const chainLabel = chain
    ? (zh ? "链 " : "Chain ") + chain
    : zh
      ? "序列"
      : "Sequence";
  const sourceLabel = showReference
    ? zh
      ? "原始序列"
      : "Original sequence"
    : zh
      ? "候选序列"
      : "Candidate sequence";
  function chooseSource(original: boolean) {
    if (original === showReference) return;
    setShowReference(original);
    if (!comparable) setPosition(null);
  }

  return (
    <section className="candidate-chain-view" aria-label={chainLabel}>
      {reference && (
        <div className="candidate-chain-header">
          <strong>{chainLabel}</strong>
          <div role="group" aria-label={zh ? "显示序列" : "Sequence source"}>
            <button
              type="button"
              aria-pressed={!showReference}
              onClick={() => chooseSource(false)}
            >
              {zh ? "候选" : "Candidate"}
            </button>
            <button
              type="button"
              aria-pressed={showReference}
              onClick={() => chooseSource(true)}
            >
              {zh ? "原始" : "Original"}
            </button>
          </div>
        </div>
      )}
      {comparable && (
        <div className="candidate-chain-changes">
          <span>
            {zh
              ? `${changes.length} 个替换`
              : `${changes.length} substitution${changes.length === 1 ? "" : "s"}`}
          </span>
          {changes.length > 0 && (
            <div
              role="group"
              aria-label={zh ? "替换位置" : "Substitution positions"}
            >
              {changes.map((change) => (
                <button
                  key={change.position}
                  type="button"
                  aria-pressed={position === change.position}
                  onClick={() => setPosition(change.position)}
                >
                  {change.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <SequenceTrack
        compact={Boolean(reference)}
        sequence={showReference ? (reference ?? sequence) : sequence}
        language={language}
        recordName={showReference ? referenceName : recordName}
        label={sourceLabel + (chain ? " · " + chain : "")}
        selectedPosition={position}
        onSelect={setPosition}
        showRegionMap={false}
        regions={changes.map((change) => ({
          start: change.position,
          end: change.position,
          label: change.label,
        }))}
      />
    </section>
  );
}
