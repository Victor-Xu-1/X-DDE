import { useCallback, useRef, useState, type ReactNode } from "react";
import type { Language } from "../types";
import { FigureExport } from "../publication/FigureExport";
import { useReveal } from "../presentation/useReveal";
import { WorkspaceFullscreenControl } from "../presentation/WorkspaceFullscreenControl";
import { MolecularViewport } from "./MolecularViewport";
import type { StructureSource } from "./molstar-controller";
import type {
  MolecularViewHandle,
  SavedMolecularView,
} from "./molecular-view-state";
import { comparisonFigure } from "../publication/paired-molecular-figure";
import "./pose-comparison.css";

export function BoundPoseComparison({
  sources,
  labels,
  language,
  initialMode = "pair",
  overlayView,
  poseActions,
  compactTools = false,
}: {
  sources: StructureSource[];
  labels: readonly [string, string];
  language: Language;
  initialMode?: "pair" | "overlay";
  overlayView?: ReactNode;
  poseActions?: readonly [ReactNode, ReactNode];
  compactTools?: boolean;
}) {
  const zh = language === "zh",
    [mode, setMode] = useState(initialMode);
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
      data-structure-focus-group
      aria-label={zh ? "结合姿势比较" : "Binding pose comparison"}
    >
      <div
        className="pose-comparison-toolbar"
        data-compact-tools={compactTools || undefined}
      >
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
              sourceKey={JSON.stringify([sources, labels, mode])}
              sourceReady={both}
              language={language}
              format="png"
              filename={`X-DDE-${labels[0]}-${labels[1]}-poses`}
              aspect={2}
              typography
              structureFraming
              compactTrigger={compactTools}
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
        {(mode === "pair" || !overlayView) && (
          <WorkspaceFullscreenControl
            language={language}
            structureFocus
            compact={compactTools}
          />
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
                <header className="pose-comparison-panel-heading">
                  <h3>
                    <span>{slot.toUpperCase()}</span> {labels[index]}
                  </h3>
                  {poseActions?.[index]}
                </header>
                <MolecularViewport
                  workspaceControls="hidden"
                  compactTools={compactTools}
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
          (overlayView ?? (
            <MolecularViewport
              workspaceControls="hidden"
              compactTools={compactTools}
              sources={sources}
              language={language}
              initialLigand="all"
              savedView={saved.current.overlay}
              onRememberView={(state) => {
                saved.current.overlay = state;
              }}
            />
          ))
        )}
      </div>
    </section>
  );
}
