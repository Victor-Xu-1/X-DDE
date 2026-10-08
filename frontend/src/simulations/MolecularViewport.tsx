import { useEffect, useRef, useState } from "react";
import type { Language } from "../types";
import type { Residue } from "./types";
import { SurfaceLegend } from "../viewer/SurfaceLegend";
import type { SurfaceSummary } from "../viewer/protocol";
import type {
  MolecularController,
  MolecularView,
  StructureSource,
} from "./molstar-controller";

export function MolecularViewport({
  sources = [],
  frames,
  frame = 0,
  language,
  focusResidue,
  onReady,
}: {
  sources?: StructureSource[];
  frames?: string[];
  frame?: number;
  language: Language;
  focusResidue?: Residue | null;
  onReady?(): void;
}) {
  const container = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<MolecularController | null>(null),
    ready = useRef(onReady);
  ready.current = onReady;
  const [loaded, setLoaded] = useState(false),
    [failure, setFailure] = useState("");
  const [presentedFrame, setPresentedFrame] = useState(0);
  const [atom, setAtom] = useState("");
  const [surfaceSummary, setSurfaceSummary] = useState<SurfaceSummary | null>(
    null,
  );
  const [view, setView] = useState<MolecularView>({
    protein: true,
    surface: false,
    contacts: true,
    ligand: "all",
  });
  const zh = language === "zh";
  const sourceKey = JSON.stringify({ sources, frames });
  useEffect(() => {
    const signal = new AbortController();
    let instance: MolecularController | undefined;
    setLoaded(false);
    setFailure("");
    void import("./molstar-controller")
      .then(async ({ MolecularController }) => {
        if (signal.signal.aborted) return;
        instance = new MolecularController();
        controller.current = instance;
        await instance.initialize(canvas.current!, container.current!, setAtom);
        signal.signal.throwIfAborted();
        const input = JSON.parse(sourceKey) as {
          sources: StructureSource[];
          frames?: string[];
        };
        await instance.load(input.sources, input.frames, signal.signal);
        if (!signal.signal.aborted) {
          setSurfaceSummary(instance.surfaceSummary);
          setLoaded(true);
          ready.current?.();
        }
      })
      .catch((error) => {
        if (!signal.signal.aborted) setFailure(String(error));
      });
    return () => {
      signal.abort();
      instance?.dispose();
      controller.current = null;
    };
  }, [sourceKey]);
  useEffect(() => {
    let active = true;
    if (loaded)
      void controller.current
        ?.setFrame(frame, () => {
          if (active) {
            setPresentedFrame(frame);
            ready.current?.();
          }
        })
        .catch((error) => {
          if (active) setFailure(String(error));
        });
    return () => {
      active = false;
    };
  }, [frame, loaded]);
  useEffect(() => {
    if (loaded) controller.current?.setView(view);
  }, [view, loaded]);
  useEffect(() => {
    if (loaded && focusResidue) controller.current?.focusResidue(focusResidue);
  }, [focusResidue, loaded]);
  const toggle = (key: "protein" | "surface" | "contacts") =>
    setView((v) => ({ ...v, [key]: !v[key] }));
  return (
    <section
      className="simulation-molecular-viewport"
      data-testid="molstar-viewport"
      data-frame={presentedFrame}
    >
      <div className="simulation-view-controls">
        <button
          type="button"
          className="text-button"
          onClick={() => controller.current?.reset()}
        >
          {zh ? "全景" : "Overview"}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => controller.current?.focusLigand()}
        >
          {zh ? "配体与口袋" : "Ligand and pocket"}
        </button>
        <button
          type="button"
          className="text-button"
          aria-pressed={view.protein}
          onClick={() => toggle("protein")}
        >
          {zh ? "蛋白" : "Protein"}
        </button>
        <button
          type="button"
          className="text-button"
          aria-pressed={view.surface}
          onClick={() => toggle("surface")}
        >
          {zh ? "表面" : "Surface"}
        </button>
        {frames && (
          <button
            type="button"
            className="text-button"
            aria-pressed={view.contacts}
            onClick={() => toggle("contacts")}
          >
            {zh ? "作用位点" : "Binding contacts"}
          </button>
        )}
        {sources.filter((s) => s.role === "ligand").length > 1 && (
          <select
            aria-label={zh ? "结合姿势显示" : "Binding pose display"}
            value={view.ligand}
            onChange={(e) =>
              setView((v) => ({
                ...v,
                ligand: e.target.value as MolecularView["ligand"],
              }))
            }
          >
            <option value="all">{zh ? "A + B 叠合" : "A + B overlay"}</option>
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
        )}
        <button
          type="button"
          className="text-button"
          onClick={() => {
            void controller.current?.snapshot();
          }}
        >
          {zh ? "下载视图" : "Download view"} ↓
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            void container.current?.parentElement?.requestFullscreen();
          }}
        >
          {zh ? "全屏" : "Fullscreen"}
        </button>
      </div>
      <div
        ref={container}
        className="simulation-webgl"
        role="application"
        aria-label={zh ? "交互式三维分子" : "Interactive 3D molecules"}
        data-loaded={loaded}
        data-error={failure || undefined}
      >
        <canvas ref={canvas} />
        {!loaded && !failure && (
          <p className="simulation-view-status" role="status">
            {zh ? "正在加载三维结构…" : "Loading 3D structures…"}
          </p>
        )}
        {failure && (
          <p className="simulation-view-status" role="alert">
            {zh
              ? "三维结构加载失败，请刷新页面。"
              : "3D structure could not load. Please refresh the page."}
          </p>
        )}
      </div>
      {view.surface && (
        <SurfaceLegend summary={surfaceSummary} language={language} />
      )}
      <p className="field-help simulation-atom-label">
        {atom ||
          (zh
            ? "拖动旋转 · 滚轮缩放 · 指向原子查看位置"
            : "Drag to rotate · Scroll to zoom · Point to an atom to inspect its position")}
      </p>
    </section>
  );
}
