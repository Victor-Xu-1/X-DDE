import { useLayoutEffect, useState } from "react";

/** Fit the live chart to a bounded prediction pane; native data and export stay intact. */
export function usePredictionPlotSize() {
  const [element, elementRef] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(420);
  useLayoutEffect(() => {
    if (!element) return;
    const pane = element.closest<HTMLElement>(".structure-workbench-details");
    if (!pane || typeof ResizeObserver !== "function") return;
    let frame = 0;
    const update = () => {
      const canvas = element.querySelector<HTMLElement>(
        ".research-plot-canvas",
      );
      if (!canvas || !pane.clientHeight) return;
      if (
        innerWidth <= 1000 ||
        !element.closest(".prediction-result") ||
        getComputedStyle(pane).overflowY !== "auto"
      ) {
        setHeight(420);
        return;
      }
      const box = canvas.getBoundingClientRect();
      const top = box.top - pane.getBoundingClientRect().top + pane.scrollTop;
      // The matrix and its axes lead; optional notes remain reachable by pane scroll.
      const widthLimit =
        innerWidth >= 1800 ? Math.max(420, pane.clientWidth) : 420;
      const next = Math.max(
        180,
        Math.min(widthLimit, Math.floor(pane.clientHeight - top - 8)),
      );
      setHeight((current) => (current === next ? current : next));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    observer.observe(pane);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [element]);
  return { elementRef, height };
}
