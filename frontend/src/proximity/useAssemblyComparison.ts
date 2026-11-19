import { useLayoutEffect, useRef, useState } from "react";
import type { AssemblyProposal } from "./types";

export function useAssemblyComparison(rows: readonly AssemblyProposal[]) {
  const [selection, setSelection] = useState<{
    ids: readonly [string, string];
    activation: number;
  } | null>(null);
  const launcher = useRef<HTMLButtonElement | null>(null);
  const details = useRef<HTMLDivElement | null>(null);
  const preview = useRef<HTMLDivElement | null>(null);
  const destination = useRef<"table" | "preview" | null>(null);
  const first = rows.find((row) => row.id === selection?.ids[0]);
  const second = rows.find((row) => row.id === selection?.ids[1]);
  const pair = first && second ? ([first, second] as const) : null;
  const comparing = Boolean(pair);
  useLayoutEffect(() => {
    if (comparing || !destination.current) return;
    const place = destination.current;
    destination.current = null;
    const panel = preview.current;
    const previewButton = panel?.querySelector<HTMLElement>(
      "[data-workspace-expand]",
    );
    const tableButton = launcher.current;
    const tableTarget =
      tableButton?.isConnected && !tableButton.disabled
        ? tableButton
        : details.current?.querySelector<HTMLElement>('input[type="search"]');
    const target =
      place === "preview" || panel?.closest('[data-workspace-focus="true"]')
        ? (previewButton ?? panel)
        : (tableTarget ?? previewButton ?? panel);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({
      block: target === tableTarget ? "center" : "nearest",
      behavior: "instant",
    });
  }, [comparing]);
  return {
    pair,
    details,
    preview,
    activation: selection?.activation ?? 0,
    open(assemblies: readonly AssemblyProposal[], trigger: HTMLButtonElement) {
      if (assemblies.length !== 2) return;
      launcher.current = trigger;
      setSelection((previous) => ({
        ids: [assemblies[0].id, assemblies[1].id],
        activation: (previous?.activation ?? 0) + 1,
      }));
    },
    close(place: "table" | "preview") {
      if (!selection) return;
      destination.current = place;
      setSelection(null);
    },
  };
}
