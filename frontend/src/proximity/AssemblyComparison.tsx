import { useLayoutEffect, useRef } from "react";
import { artifactUrl } from "../api";
import { WorkspaceFullscreenControl } from "../presentation/WorkspaceFullscreenControl";
import type { Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import { AssemblyFiles } from "./AssemblyFiles";
import type { AssemblyProposal } from "./types";

export function AssemblyComparison({
  jobId,
  assemblies,
  labels,
  language,
  activation,
  onBack,
  onInspect,
}: {
  jobId: string;
  assemblies: readonly [AssemblyProposal, AssemblyProposal];
  labels: readonly [string, string];
  language: Language;
  activation: number;
  onBack(): void;
  onInspect(id: string): void;
}) {
  const zh = language === "zh";
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    heading.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
    heading.current?.focus({ preventScroll: true });
  }, [activation]);
  return (
    <section
      className="proximity-assembly-comparison"
      data-structure-focus-group
      aria-label={zh ? "三维装配比较" : "3D assembly comparison"}
    >
      <div className="proximity-compare-toolbar">
        <div>
          <h3 ref={heading} tabIndex={-1}>
            {zh ? "装配并列比较" : "Compare assemblies side by side"}
          </h3>
          <p className="field-help">
            {zh
              ? "两幅视图分别使用各装配的原始坐标。"
              : "Each view uses its assembly's original coordinates."}
          </p>
        </div>
        <div className="proximity-compare-actions">
          <button type="button" className="secondary-button" onClick={onBack}>
            {zh ? "返回单个装配" : "Return to single assembly"}
          </button>
          <WorkspaceFullscreenControl
            language={language}
            compact
            structureFocus
          />
        </div>
      </div>
      <div className="proximity-compare-panels">
        {assemblies.map((assembly, index) => {
          const slot = index === 0 ? "A" : "B";
          const complex = artifactUrl(jobId, assembly.complex_artifact);
          const ligand = artifactUrl(jobId, assembly.ligand_artifact);
          const accepted = assembly.quality.accepted;
          const label = labels[index];
          return (
            <section key={assembly.id} aria-label={`${slot} · ${label}`}>
              <header className="proximity-compare-pane-heading">
                <div>
                  <h4>
                    <span>{slot}</span> {label}
                  </h4>
                  <small
                    className={
                      accepted ? "proximity-check-pass" : "proximity-check-fail"
                    }
                  >
                    {accepted
                      ? zh
                        ? "基本几何通过"
                        : "Basic geometry passed"
                      : zh
                        ? "诊断结构 · 几何待复核"
                        : "Diagnostic · Review geometry"}
                  </small>
                </div>
                <div className="proximity-compare-actions">
                  <button
                    type="button"
                    className="text-button"
                    aria-label={zh ? `单独检查${label}` : `Inspect ${label}`}
                    onClick={() => onInspect(assembly.id)}
                  >
                    {zh ? "单独检查" : "Inspect"}
                  </button>
                  <AssemblyFiles
                    complex={complex}
                    ligand={ligand}
                    language={language}
                  />
                </div>
              </header>
              <StructureViewer
                sourceSnapshot
                initialMode="cartoon"
                urls={[complex]}
                molecularSource={{ url: ligand, record: 0 }}
                language={language}
                showWorkspaceControls={false}
              />
            </section>
          );
        })}
      </div>
    </section>
  );
}
