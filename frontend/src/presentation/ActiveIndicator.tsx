import { useEffect, useState, type RefObject } from "react";
import "./active-indicator.css";

/** Track the real selected control across labels, scrolling and responsive widths. */
export function ActiveIndicator({
  container,
  selection,
}: {
  container: RefObject<HTMLElement | null>;
  selection: string | number;
}) {
  const [position, setPosition] = useState<{
    x: number;
    y: number;
    width: number;
  } | null>(null);
  // Parent host refs attach after child layout effects; measure after the full commit.
  useEffect(() => {
    const parent = container.current;
    const active = parent?.querySelector<HTMLElement>(
      ':scope > button[aria-selected="true"], :scope > button[aria-current="step"], :scope > button[aria-pressed="true"]',
    );
    if (!parent || !active) {
      setPosition(null);
      return;
    }
    const measure = () => {
      const outer = parent.getBoundingClientRect(),
        inner = active.getBoundingClientRect();
      if (!(outer.width > 0 && inner.width > 0)) {
        setPosition(null);
        return;
      }
      const next = {
        x: inner.left - outer.left + parent.scrollLeft,
        y: inner.bottom - outer.top + parent.scrollTop - 2,
        width: inner.width,
      };
      setPosition((previous) =>
        previous &&
        Math.abs(previous.x - next.x) < 0.25 &&
        Math.abs(previous.y - next.y) < 0.25 &&
        Math.abs(previous.width - next.width) < 0.25
          ? previous
          : next,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(parent);
    // Earlier labels/counts can move the selected control without resizing it.
    parent
      .querySelectorAll(":scope > button")
      .forEach((button) => observer?.observe(button));
    return () => observer?.disconnect();
  }, [container, selection]);
  return position ? (
    <span
      className="active-control-indicator"
      aria-hidden="true"
      style={{
        width: position.width,
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
    />
  ) : null;
}
