import { useEffect, useRef, useState } from "react";
import type { Language } from "../types";
import type { Residue } from "./types";
import { SurfaceLegend } from "../viewer/SurfaceLegend";
import { FigureExport } from "../publication/FigureExport";
import type { SurfaceSummary } from "../viewer/protocol";
import type {
  MolecularController,
  MolecularView,
  StructureSource,
} from "./molstar-controller";
import {
  visibleViewport,
  type SavedMolecularView,
  type MolecularViewHandle,
} from "./molecular-view-state";

export function MolecularViewport({
  sources = [],
  frames,
  frame = 0,
  ligandContext = true,
  language,
  focusResidue,
  onReady,
  onExport,
  fixedLigand,
  savedView,
  onViewHandle,
  onRememberView,
}: {
  sources?: StructureSource[];
  frames?: string[];
  frame?: number;
  ligandContext?: boolean;
  language: Language;
  focusResidue?: Residue | null;
  onReady?(): void;
  onExport?(): void;
  fixedLigand?: "a" | "b";
  savedView?: SavedMolecularView;
  onViewHandle?(handle: MolecularViewHandle | null): void;
  onRememberView?(state: SavedMolecularView): void;
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
  const initial = useRef(savedView);
  const [view, setView] = useState<MolecularView>(
    savedView?.view ?? {
      protein: true,
      surface: false,
      contacts: true,
      ligand:
        fixedLigand ??
        (sources.filter((source) => source.role === "ligand").length > 1
          ? "a"
          : "all"),
    },
  );
  const liveView = useRef(view);
  liveView.current = view;
  const handleChange = useRef(onViewHandle),
    remember = useRef(onRememberView);
  handleChange.current = onViewHandle;
  remember.current = onRememberView;
  const zh = language === "zh";
  const comparing =
    !frames &&
    sources.filter((source) => source.role === "ligand").length > 1 &&
    view.ligand === "all";
  const sourceKey = JSON.stringify({ sources, frames, ligandContext });
  useEffect(() => {
    const signal = new AbortController();
    let instance: MolecularController | undefined;
    setLoaded(false);
    setFailure("");
    void visibleViewport(container.current!, signal.signal)
      .then(() => import("./molstar-controller"))
      .then(async ({ MolecularController }) => {
        if (signal.signal.aborted) return;
        instance = new MolecularController();
        controller.current = instance;
        await instance.initialize(canvas.current!, container.current!, setAtom);
        signal.signal.throwIfAborted();
        const input = JSON.parse(sourceKey) as {
          sources: StructureSource[];
          frames?: string[];
          ligandContext: boolean;
        };
        await instance.load(
          input.sources,
          input.frames,
          signal.signal,
          input.ligandContext,
          {
            ...liveView.current,
            ligand: fixedLigand ?? liveView.current.ligand,
          },
        );
        if (initial.current?.camera)
          instance.restoreCamera(initial.current.camera);
        if (!signal.signal.aborted) {
          setSurfaceSummary(instance.surfaceSummary);
          setLoaded(true);
          handleChange.current?.({
            capture: (settings, pixels) => instance!.figure(settings, pixels),
            snapshot: () => ({
              view: { ...liveView.current },
              camera: instance!.cameraSnapshot(),
            }),
            restoreCamera: (snapshot) => instance!.restoreCamera(snapshot),
          });
          ready.current?.();
        }
      })
      .catch((error) => {
        if (!signal.signal.aborted) setFailure(String(error));
      });
    return () => {
      signal.abort();
      if (instance)
        remember.current?.({
          view: { ...liveView.current },
          camera: instance.cameraSnapshot(),
        });
      handleChange.current?.(null);
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
      data-ligand={view.ligand}
    >
      <div className="simulation-view-controls">
        <button
          type="button"
          className="text-button"
          onClick={() => controller.current?.reset()}
        >
          {zh ? "全景" : "Overview"}
        </button>
        {ligandContext && (
          <button
            type="button"
            className="text-button"
            onClick={() => controller.current?.focusLigand()}
          >
            {zh ? "配体与口袋" : "Ligand and pocket"}
          </button>
        )}
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
        {ligandContext &&
          (frames || sources.some((source) => source.role === "ligand")) && (
            <button
              type="button"
              className="text-button"
              aria-pressed={view.contacts && !comparing}
              disabled={comparing}
              title={
                comparing
                  ? zh
                    ? "选择 A 或 B 查看对应作用位点"
                    : "Select A or B to inspect its binding contacts"
                  : undefined
              }
              onClick={() => toggle("contacts")}
            >
              {zh ? "作用位点" : "Binding contacts"}
            </button>
          )}
        {!fixedLigand &&
          sources.filter((s) => s.role === "ligand").length > 1 && (
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
        <FigureExport
          language={language}
          filename="X-DDE-structure"
          format="png"
          molecular
          disabled={!loaded}
          label={zh ? "下载视图" : "Download view"}
          onStart={onExport}
          aspect={() => {
            const bounds = container.current?.getBoundingClientRect();
            return bounds ? bounds.width / bounds.height : 1.5;
          }}
          render={(settings) => {
            if (!controller.current)
              throw new Error("The molecular view is not ready.");
            return controller.current.figure(settings);
          }}
        />
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
      {view.protein && (
        <div
          className="simulation-pose-legend"
          aria-label={
            zh ? "蛋白二级结构颜色" : "Protein secondary structure colors"
          }
        >
          <span>
            <i style={{ background: "#eb777a" }} />
            {zh ? "螺旋" : "Helix"}
          </span>
          <span>
            <i style={{ background: "#e8bd48" }} />
            {zh ? "折叠片" : "Sheet"}
          </span>
          <span>
            <i style={{ background: "#8ea6bf" }} />
            {zh ? "环与转角" : "Loop and turn"}
          </span>
        </div>
      )}
      {!fixedLigand &&
        sources.filter((source) => source.role === "ligand").length > 1 && (
          <div className="simulation-pose-legend">
            {sources
              .filter((source) => source.role === "ligand")
              .map((source, i) => (
                <span key={source.url}>
                  <i style={{ background: i ? "#23b8d0" : "#36bf65" }} />
                  {i ? "B" : "A"} · {source.label}
                </span>
              ))}
          </div>
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
