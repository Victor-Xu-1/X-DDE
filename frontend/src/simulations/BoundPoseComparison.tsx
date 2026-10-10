import { useCallback, useRef, useState } from "react";
import type { Language } from "../types";
import { FigureExport } from "../publication/FigureExport";
import { useReveal } from "../presentation/useReveal";
import { MolecularViewport } from "./MolecularViewport";
import type { StructureSource } from "./molstar-controller";
import type {
  MolecularViewHandle,
  SavedMolecularView,
} from "./molecular-view-state";
import { comparisonFigure } from "./comparison-figure";
import "./pose-comparison.css";

export function BoundPoseComparison({
  sources,
  labels,
  language,
}: {
  sources: StructureSource[];
  labels: readonly [string, string];
  language: Language;
}) {
  const zh = language === "zh",
    [mode, setMode] = useState<"pair" | "overlay">("pair");
  const handles = useRef<
    Partial<Record<"a" | "b" | "overlay", MolecularViewHandle>>
  >({});
  const saved = useRef<
    Partial<Record<"a" | "b" | "overlay", SavedMolecularView>>
  >({});
  const [ready, setReady] = useState({ a: false, b: false });
  const panel = useRef<HTMLDivElement>(null);
  useReveal(panel, mode);
  const registerA = useCallback((handle: MolecularViewHandle | null) => {
    handles.current.a = handle ?? undefined;
    setReady((r) => ({ ...r, a: !!handle }));
  }, []);
  const registerB = useCallback((handle: MolecularViewHandle | null) => {
    handles.current.b = handle ?? undefined;
    setReady((r) => ({ ...r, b: !!handle }));
  }, []);
  const both = ready.a && ready.b;
  return (
    <section
      className="bound-pose-comparison"
      aria-label={zh ? "结合姿势比较" : "Binding pose comparison"}
    >
      <div className="pose-comparison-toolbar">
        <div role="group" aria-label={zh ? "比较方式" : "Comparison layout"}>
          <button
            type="button"
            className="text-button"
            aria-pressed={mode === "pair"}
            onClick={() => setMode("pair")}
          >
            {zh ? "A / B 并列" : "A / B side by side"}
          </button>
          <button
            type="button"
            className="text-button"
            aria-pressed={mode === "overlay"}
            onClick={() => setMode("overlay")}
          >
            {zh ? "叠加查看" : "Overlay"}
          </button>
        </div>
        {mode === "pair" && (
          <>
            <button
              type="button"
              className="text-button"
              disabled={!both}
              title={
                zh
                  ? "将 A 的相机方向与缩放用于 B，原始坐标保持原样。"
                  : "Use A's camera orientation and zoom on B; original coordinates remain unchanged."
              }
              onClick={() => {
                const snapshot = handles.current.a?.snapshot().camera;
                if (snapshot) handles.current.b?.restoreCamera(snapshot);
              }}
            >
              {zh ? "匹配视角" : "Match views"}
            </button>
            <FigureExport
              language={language}
              format="png"
              filename={`X-DDE-${labels[0]}-${labels[1]}-poses`}
              aspect={2}
              typography
              label={zh ? "导出比较图" : "Export comparison"}
              disabled={!both}
              render={(settings) => {
                const { a, b } = handles.current;
                if (!a || !b)
                  throw new Error("Both molecular views must be ready.");
                return comparisonFigure(settings, [a, b], labels);
              }}
            />
          </>
        )}
      </div>
      <div ref={panel}>
        {mode === "pair" ? (
          <div className="pose-comparison-panels">
            {(["a", "b"] as const).map((slot, index) => (
              <section
                key={slot}
                aria-label={`${slot.toUpperCase()} · ${labels[index]}`}
              >
                <h3>
                  <span>{slot.toUpperCase()}</span> {labels[index]}
                </h3>
                <MolecularViewport
                  sources={sources}
                  language={language}
                  fixedLigand={slot}
                  savedView={saved.current[slot]}
                  onViewHandle={slot === "a" ? registerA : registerB}
                  onRememberView={(state) => {
                    saved.current[slot] = state;
                  }}
                />
              </section>
            ))}
          </div>
        ) : (
          <MolecularViewport
            sources={sources}
            language={language}
            savedView={saved.current.overlay}
            onRememberView={(state) => {
              saved.current.overlay = state;
            }}
          />
        )}
      </div>
    </section>
  );
}
