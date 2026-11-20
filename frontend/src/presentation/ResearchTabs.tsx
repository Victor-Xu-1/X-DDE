import "./research-tabs.css";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useReveal } from "./useReveal";
import { ActiveIndicator } from "./ActiveIndicator";

export type ResearchTab = {
  id: string;
  label: string;
  shortLabel?: string;
  content: ReactNode;
  count?: number;
};

export function ResearchTabs({
  tabs,
  label,
  active: controlled,
  onChange,
  toolbar,
}: {
  tabs: readonly ResearchTab[];
  label: string;
  active?: string;
  onChange?(id: string): void;
  toolbar?: ReactNode;
}) {
  const id = useId(),
    [active, setActive] = useState(tabs[0]?.id);
  const [visited, setVisited] = useState(
    () =>
      new Set([tabs.find((tab) => tab.id === controlled)?.id ?? tabs[0]?.id]),
  );
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = controlled ?? active;
  const current = tabs.some((t) => t.id === selected) ? selected : tabs[0]?.id;
  function choose(id: string) {
    setActive(id);
    onChange?.(id);
    setVisited((previous) => new Set([...previous, id]));
  }
  const panel = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const geometry = JSON.stringify(
    tabs.map(({ id, label, shortLabel, count }) => [
      id,
      label,
      shortLabel,
      count,
    ]),
  );
  useEffect(() => {
    if (current)
      setVisited((previous) =>
        previous.has(current) ? previous : new Set([...previous, current]),
      );
  }, [current]);
  useEffect(() => {
    const node = track.current;
    if (!node) return;
    const selected = node.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-selected="true"]',
    );
    if (!selected) return;
    // Scroll this track only. Native panels, focus and the page position stay intact.
    const reveal = () => {
      const outer = node.getBoundingClientRect(),
        inner = selected.getBoundingClientRect();
      if (!(node.clientWidth > 0 && outer.width > 0 && inner.width > 0)) return;
      const left = outer.left + node.clientLeft,
        right = left + node.clientWidth;
      const rtl = getComputedStyle(node).direction === "rtl";
      const delta =
        inner.width > node.clientWidth
          ? rtl
            ? inner.right - right
            : inner.left - left
          : inner.left < left
            ? inner.left - left
            : inner.right > right
              ? inner.right - right
              : 0;
      if (Math.abs(delta) < 0.5) return;
      const maximum = Math.max(0, node.scrollWidth - node.clientWidth);
      node.scrollLeft = Math.max(
        rtl ? -maximum : 0,
        Math.min(rtl ? 0 : maximum, node.scrollLeft + delta),
      );
    };
    reveal();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(reveal) : null;
    observer?.observe(node);
    node
      .querySelectorAll(':scope > [role="tab"]')
      .forEach((button) => observer?.observe(button));
    if (!observer) window.addEventListener("resize", reveal);
    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", reveal);
    };
  }, [current, geometry]);
  useReveal(panel, current ?? "");
  const navigation = (
    <div
      ref={track}
      className="research-tab-list"
      role="tablist"
      aria-label={label}
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(el) => {
            buttons.current[index] = el;
          }}
          type="button"
          role="tab"
          aria-label={tab.shortLabel ? tab.label : undefined}
          id={id + "-tab-" + tab.id}
          aria-selected={current === tab.id}
          aria-controls={id + "-panel-" + tab.id}
          tabIndex={current === tab.id ? 0 : -1}
          onClick={() => {
            choose(tab.id);
          }}
          onKeyDown={(e) => {
            const next =
              e.key === "ArrowRight"
                ? (index + 1) % tabs.length
                : e.key === "ArrowLeft"
                  ? (index - 1 + tabs.length) % tabs.length
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? tabs.length - 1
                      : null;
            if (next !== null) {
              e.preventDefault();
              choose(tabs[next].id);
              buttons.current[next]?.focus();
            }
          }}
        >
          {tab.shortLabel ?? tab.label}
          {tab.count != null && <span>{tab.count}</span>}
        </button>
      ))}
      <ActiveIndicator container={track} selection={current + ":" + geometry} />
    </div>
  );
  return (
    <div className="research-tabs">
      {toolbar ? (
        <div className="research-tab-toolbar">
          {navigation}
          {toolbar}
        </div>
      ) : (
        navigation
      )}
      {tabs.map((tab) => (
        <section
          role="tabpanel"
          ref={current === tab.id ? panel : undefined}
          key={tab.id}
          id={id + "-panel-" + tab.id}
          aria-labelledby={id + "-tab-" + tab.id}
          hidden={current !== tab.id}
          tabIndex={0}
        >
          {(visited.has(tab.id) || current === tab.id) && tab.content}
        </section>
      ))}
    </div>
  );
}
