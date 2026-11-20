import { useMemo, useRef, useState } from "react";
import { FigureExport } from "../publication/FigureExport";
import { comparisonFigure } from "../publication/paired-molecular-figure";
import type { Language } from "../types";
import type { StructureFigureHandle } from "./useStructureFigure";

type Handle = StructureFigureHandle | null;
type Pair = readonly [Handle, Handle];

export function useStructurePairFigure() {
  const current = useRef<Pair>([null, null]);
  const [pair, setPair] = useState(current.current);
  const publish = useMemo(() => {
    function set(side: 0 | 1, handle: Handle) {
      if (current.current[side] === handle) return;
      const [a, b] = current.current;
      current.current = side === 0 ? [handle, b] : [a, handle];
      setPair(current.current);
    }
    return [
      (handle: Handle) => set(0, handle),
      (handle: Handle) => set(1, handle),
    ] as const;
  }, []);
  return { current, pair, publish };
}

export function StructurePairFigure({
  figure,
  labels,
  language,
  filename,
  disabled = false,
  compactTrigger = false,
}: {
  figure: ReturnType<typeof useStructurePairFigure>;
  labels: readonly [string, string];
  language: Language;
  filename: string;
  disabled?: boolean;
  compactTrigger?: boolean;
}) {
  const zh = language === "zh";
  const [a, b] = figure.pair;
  return (
    <FigureExport
      language={language}
      filename={filename}
      sourceKey={JSON.stringify([a?.sourceKey, b?.sourceKey, labels])}
      sourceReady={Boolean(a && b)}
      disabled={disabled}
      compactTrigger={compactTrigger}
      format="png"
      aspect={2}
      typography
      structureFraming
      autoStructureFraming
      label={zh ? "导出比较图" : "Export comparison"}
      render={async (settings) => {
        const [left, right] = figure.current.current;
        if (!left || !right || left !== a || right !== b)
          throw new Error("Both molecular views must be ready.");
        const png = await comparisonFigure(
          settings,
          [left, right],
          labels,
          true,
        );
        if (
          figure.current.current[0] !== left ||
          figure.current.current[1] !== right
        )
          throw new Error("The molecular views changed during export.");
        return png;
      }}
    />
  );
}
