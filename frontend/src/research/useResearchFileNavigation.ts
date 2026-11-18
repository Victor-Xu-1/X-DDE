import { useLayoutEffect, useRef, useState } from "react";

/** Narrow view transitions leave the file list and its selection mounted. */
export function useResearchFileNavigation(assetId?: string) {
  const [browsing, setBrowsing] = useState(false);
  const preview = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const returnPoint = useRef<{ button: HTMLButtonElement; scrollTop: number }>(
    null,
  );
  const focusNext = useRef<"preview" | "list" | null>(null);
  const pane = assetId && !browsing ? "preview" : "list";

  function open(button?: HTMLButtonElement) {
    if (button)
      returnPoint.current = { button, scrollTop: list.current?.scrollTop ?? 0 };
    else if (pane === "list") returnPoint.current = null;
    if (window.matchMedia?.("(max-width: 1000px)").matches)
      focusNext.current = "preview";
    setBrowsing(false);
  }

  function back() {
    focusNext.current = "list";
    setBrowsing(true);
  }

  useLayoutEffect(() => {
    if (focusNext.current !== pane) return;
    focusNext.current = null;
    const origin = returnPoint.current;
    if (pane === "list" && origin && list.current)
      list.current.scrollTop = origin.scrollTop;
    const destination =
      pane === "preview"
        ? preview.current
        : origin?.button.isConnected
          ? origin.button
          : search.current;
    destination?.focus({ preventScroll: true });
    destination?.scrollIntoView?.({
      block: pane === "preview" ? "start" : "nearest",
      behavior: "instant",
    });
  }, [assetId, pane]);

  return { pane, preview, list, search, open, back };
}
