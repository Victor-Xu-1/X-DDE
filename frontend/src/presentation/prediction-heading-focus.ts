import { useLayoutEffect, useRef } from "react";

/** Keep the existing questionnaire's focused heading below its floating toolbar. */
export function usePredictionHeadingFocus(enabled: boolean) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = root.current;
    if (!enabled || !node) return;
    let frame = 0;
    function reveal(event: FocusEvent) {
      const target = event.target;
      if (
        !(target instanceof HTMLElement) ||
        !target.matches(".questionnaire-heading")
      )
        return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!node!.contains(target) || document.activeElement !== target)
          return;
        const toolbar = node!
          .closest(".studio-app")
          ?.querySelector(".studio-topbar");
        if (!toolbar) return;
        const header = toolbar.getBoundingClientRect();
        const heading = target.getBoundingClientRect();
        if (!header.height || !heading.height) return;
        const delta = heading.top - header.bottom - 16;
        if (delta < 0) window.scrollBy({ top: delta, behavior: "instant" });
      });
    }
    node.addEventListener("focusin", reveal);
    return () => {
      node.removeEventListener("focusin", reveal);
      window.cancelAnimationFrame(frame);
    };
  }, [enabled]);
  return root;
}
