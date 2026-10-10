import { useLayoutEffect, useRef } from "react";
import type { Language } from "../types";
import type { SequenceRegion } from "./SequenceTrack";

/** Bounded DOM and one keyboard entry point; numbering always uses the full input. */
export function SequencePositions({
  sequence,
  label,
  language,
  regions,
  position,
  select,
}: {
  sequence: string;
  label: string;
  language: Language;
  regions: readonly SequenceRegion[];
  position: number | null;
  select(position: number): void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const keyboardFocus = useRef<number | null>(null);
  const size = 600;
  const start = Math.floor(((position ?? 1) - 1) / size) * size;
  const end = Math.min(sequence.length, start + size);
  useLayoutEffect(() => {
    if (keyboardFocus.current === null) return;
    grid.current
      ?.querySelector<HTMLButtonElement>(
        `[data-position="${keyboardFocus.current}"]`,
      )
      ?.focus({ preventScroll: true });
    keyboardFocus.current = null;
  }, [position, start]);
  function move(key: string, index: number) {
    const columns = grid.current
      ? getComputedStyle(grid.current).gridTemplateColumns.split(/\s+/).length
      : 1;
    const next = (
      {
        ArrowLeft: index - 1,
        ArrowRight: index + 1,
        ArrowUp: index - columns,
        ArrowDown: index + columns,
        Home: 1,
        End: sequence.length,
      } as Record<string, number>
    )[key];
    if (next === undefined) return false;
    const target = Math.max(1, Math.min(sequence.length, next));
    keyboardFocus.current = target;
    select(target);
    return true;
  }
  return (
    <>
      <div className="sequence-residue-grid" ref={grid}>
        {Array.from(sequence.slice(start, end)).map((aa, offset) => {
          const index = start + offset + 1;
          const region = regions.find(
            (value) => index >= value.start && index <= value.end,
          );
          return (
            <button
              key={index}
              type="button"
              data-position={index}
              tabIndex={(position ?? start + 1) === index ? 0 : -1}
              className={
                (region ? "has-region " : "") +
                (position === index ? "is-selected" : "")
              }
              aria-label={`${label} · ${index} ${aa}${region ? " · " + region.label : ""}`}
              title={`${index} · ${aa}${region ? " · " + region.label : ""}`}
              aria-pressed={position === index}
              onClick={() => select(index)}
              onKeyDown={(event) => {
                if (move(event.key, index)) event.preventDefault();
              }}
            >
              <small>{(index - 1) % 10 === 0 ? index : ""}</small>
              {aa}
            </button>
          );
        })}
      </div>
      {sequence.length > size && (
        <div
          className="sequence-segment-controls"
          role="group"
          aria-label={language === "zh" ? "序列分段" : "Sequence segments"}
        >
          <button
            type="button"
            disabled={start === 0}
            onClick={() => select(Math.max(1, start - size + 1))}
          >
            {language === "zh" ? "上一段" : "Previous segment"}
          </button>
          <span>
            {start + 1}–{end} / {sequence.length}
          </span>
          <button
            type="button"
            disabled={end === sequence.length}
            onClick={() => select(end + 1)}
          >
            {language === "zh" ? "下一段" : "Next segment"}
          </button>
        </div>
      )}
    </>
  );
}
