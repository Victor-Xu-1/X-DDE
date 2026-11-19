import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { Language } from "../types";
import "./candidate-review-bar.css";

type CandidateMetric = {
  label: string;
  value: string | number;
  detail?: string;
};

export function CandidateReviewMetrics({
  metrics,
}: {
  metrics: readonly CandidateMetric[];
}) {
  if (!metrics.length) return null;
  return (
    <dl className="candidate-review-metrics">
      {metrics.map(({ label, value, detail }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {value}
            {detail && <small>{detail}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CandidateReviewBar({
  label,
  caption,
  candidates,
  selected,
  metrics,
  language,
  onSelect,
  actions,
}: {
  label: string;
  caption: string;
  candidates: { id: number; label: string; short: number }[];
  selected?: number;
  metrics?: readonly CandidateMetric[];
  language: Language;
  onSelect(id: number): void;
  actions?: ReactNode;
}) {
  const zh = language === "zh";
  const track = useRef<HTMLDivElement>(null);
  const current = candidates.findIndex(
    (candidate) => candidate.id === selected,
  );
  function move(offset: -1 | 1) {
    const index = current + offset;
    const target = candidates[index];
    if (!target) return;
    // At an endpoint the arrow loses its enabled state. Keep focus on its record.
    if (index === 0 || index === candidates.length - 1)
      track.current
        ?.querySelectorAll("button")
        [index]?.focus({ preventScroll: true });
    onSelect(target.id);
  }

  useLayoutEffect(() => {
    const list = track.current;
    const active = list?.querySelector('[aria-pressed="true"]');
    if (!list || !active) return;
    const outer = list.getBoundingClientRect();
    const inner = active.getBoundingClientRect();
    if (inner.left < outer.left) list.scrollLeft += inner.left - outer.left;
    if (inner.right > outer.right) list.scrollLeft += inner.right - outer.right;
  }, [selected]);

  if (!candidates.length) return null;
  return (
    <section className="candidate-review-bar" aria-label={label}>
      <div className="candidate-review-selector">
        <span>{caption}</span>
        <nav aria-label={zh ? "切换候选" : "Switch candidate"}>
          <button
            type="button"
            aria-label={zh ? "上一个候选" : "Previous candidate"}
            disabled={current < 1}
            onClick={() => move(-1)}
          >
            ‹
          </button>
          <div className="candidate-review-options" ref={track}>
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                aria-label={candidate.label}
                aria-pressed={candidate.id === selected}
                onClick={() => onSelect(candidate.id)}
              >
                {candidate.short}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label={zh ? "下一个候选" : "Next candidate"}
            disabled={current >= candidates.length - 1}
            onClick={() => move(1)}
          >
            ›
          </button>
        </nav>
      </div>
      {metrics && <CandidateReviewMetrics metrics={metrics} />}
      {actions}
    </section>
  );
}
