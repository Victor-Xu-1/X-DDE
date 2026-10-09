import { useEffect, useRef, useState } from "react";
import type { Core } from "cytoscape";
import type { Language } from "../types";
import type { FreeEnergyResult } from "./types";
import { FigureExport } from "../publication/FigureExport";
import { networkFigure } from "../publication/cytoscape";
import "../presentation/plots/plots.css";

export function FreeEnergyNetwork({
  result,
  selected,
  onSelect,
  language,
}: {
  result: FreeEnergyResult;
  selected: string;
  onSelect(id: string): void;
  language: Language;
}) {
  const container = useRef<HTMLDivElement>(null),
    graph = useRef<Core | null>(null),
    callback = useRef(onSelect);
  callback.current = onSelect;
  const activeSelection = useRef(selected);
  activeSelection.current = selected;
  const selectGraph = useRef<
    (typeof import("./network-controller"))["selectNetworkEdge"] | null
  >(null);
  const [failure, setFailure] = useState(false);
  const zh = language === "zh";
  useEffect(() => {
    let active = true;
    const observer = new ResizeObserver(() => graph.current?.resize());
    observer.observe(container.current!);
    void import("./network-controller")
      .then(({ createNetwork, selectNetworkEdge }) => {
        if (!active) return;
        graph.current = createNetwork(container.current!, result, (id) =>
          callback.current(id),
        );
        selectGraph.current = selectNetworkEdge;
        selectNetworkEdge(graph.current, result, activeSelection.current);
      })
      .catch(() => {
        if (active) setFailure(true);
      });
    return () => {
      active = false;
      observer.disconnect();
      graph.current?.destroy();
      graph.current = null;
    };
  }, [result]);
  useEffect(() => {
    if (graph.current) selectGraph.current?.(graph.current, result, selected);
  }, [selected, result]);
  return (
    <section className="fep-network simulation-plot">
      <header>
        <h3>{zh ? "分子变化网络" : "Molecular perturbation network"}</h3>
        <div className="research-chart-controls">
          <button
            type="button"
            className="text-button"
            onClick={() => graph.current?.fit(undefined, 42)}
          >
            {zh ? "适应画布" : "Fit network"}
          </button>
          <FigureExport
            language={language}
            filename="X-DDE-FEP-network"
            format="png"
            typography
            disabled={failure}
            aspect={() => {
              return graph.current
                ? graph.current.width() / graph.current.height()
                : 1.5;
            }}
            render={async (settings) => {
              if (!graph.current || !container.current)
                throw new Error("Network is not ready.");
              return networkFigure(graph.current, container.current, settings);
            }}
          />
        </div>
      </header>
      {failure && (
        <p role="alert">
          {zh
            ? "网络加载失败，请刷新页面。"
            : "Network could not load. Please refresh the page."}
        </p>
      )}
      <div
        ref={container}
        className="fep-network-canvas"
        role="application"
        aria-label={
          zh
            ? "相对结合自由能变化网络"
            : "Relative binding free-energy perturbation network"
        }
      />
      <label className="simulation-network-selection">
        {zh ? "选择分子变化" : "Select molecular change"}
        <select value={selected} onChange={(e) => onSelect(e.target.value)}>
          {result.edges.map((edge) => (
            <option key={edge.id} value={edge.id}>
              {edge.a} → {edge.b}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
