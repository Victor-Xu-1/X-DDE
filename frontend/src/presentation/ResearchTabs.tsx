import "./research-tabs.css";
import { useId, useRef, useState, type ReactNode } from "react";
import { useReveal } from "./useReveal";
import { ActiveIndicator } from "./ActiveIndicator";
export function ResearchTabs({
  tabs,
  label,
}: {
  tabs: readonly {
    id: string;
    label: string;
    content: ReactNode;
    count?: number;
  }[];
  label: string;
}) {
  const id = useId(),
    [active, setActive] = useState(tabs[0]?.id);
  const [visited, setVisited] = useState(new Set([tabs[0]?.id]));
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = tabs.some((t) => t.id === active) ? active : tabs[0]?.id;
  const panel = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  useReveal(panel, current ?? "");
  return (
    <div className="research-tabs">
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
            id={id + "-tab-" + tab.id}
            aria-selected={current === tab.id}
            aria-controls={id + "-panel-" + tab.id}
            tabIndex={current === tab.id ? 0 : -1}
            onClick={() => {
              setActive(tab.id);
              setVisited((previous) => new Set([...previous, tab.id]));
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
                setActive(tabs[next].id);
                setVisited((previous) => new Set([...previous, tabs[next].id]));
                buttons.current[next]?.focus();
              }
            }}
          >
            {tab.label}
            {tab.count != null && <span>{tab.count}</span>}
          </button>
        ))}
        <ActiveIndicator
          container={track}
          selection={current + ":" + tabs.map((tab) => tab.label).join("|")}
        />
      </div>
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
