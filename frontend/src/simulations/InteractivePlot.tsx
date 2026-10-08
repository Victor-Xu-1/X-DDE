import { useEffect, useRef, useState } from "react";
import type * as Plotly from "plotly.js";
import type { Language } from "../types";
import "./plotly-native.css";

export function InteractivePlot({
  title,
  data,
  layout,
  language,
  onPoint,
  height = 280,
}: {
  title: string;
  data: Plotly.Data[];
  layout?: Partial<Plotly.Layout>;
  language: Language;
  onPoint?(point: Plotly.PlotDatum): void;
  height?: number;
}) {
  const element = useRef<(HTMLDivElement & Plotly.PlotlyHTMLElement) | null>(
    null,
  );
  const callback = useRef(onPoint);
  callback.current = onPoint;
  const queue = useRef(Promise.resolve());
  const [error, setError] = useState(false);
  const [dragMode, setDragMode] = useState<"zoom" | "pan">("zoom");
  const plot = useRef<typeof Plotly | null>(null);
  const zh = language === "zh";
  const signature = JSON.stringify({ data, layout, height, title, dragMode });
  useEffect(() => {
    const target = element.current!;
    let disposed = false;
    const observer = new ResizeObserver(() => {
      if (plot.current && target.data && target.offsetWidth > 0)
        void plot.current.Plots.resize(target);
    });
    observer.observe(target);
    const ready = import("plotly.js-cartesian-dist-min").then(
      ({ default: library }) => {
        if (!disposed) plot.current = library;
        return library;
      },
    );
    queue.current = ready.then(() => {});
    return () => {
      disposed = true;
      observer.disconnect();
      void ready.then((p) => p.purge(target));
      plot.current = null;
    };
  }, []);
  useEffect(() => {
    let active = true;
    queue.current = queue.current
      .then(async () => {
        const target = element.current,
          p = plot.current;
        if (!active || !target || !p) return;
        await p.react(
          target,
          data,
          {
            autosize: true,
            height,
            margin: { l: 58, r: 18, t: 16, b: 56 },
            font: { family: "Inter, sans-serif", size: 11, color: "#526079" },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            hovermode: "closest",
            dragmode: dragMode,
            uirevision: title,
            legend: { orientation: "h", y: -0.26, x: 0 },
            ...layout,
          },
          {
            responsive: true,
            displaylogo: false,
            scrollZoom: true,
            displayModeBar: false,
          },
        );
        target.removeAllListeners("plotly_click");
        target.on("plotly_click", (event) => {
          if (event.points[0]) callback.current?.(event.points[0]);
        });
        if (active) setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [signature]);
  return (
    <section className="simulation-plot">
      <header>
        <h3>{title}</h3>
        <div className="simulation-chart-controls">
          <select
            aria-label={zh ? "图表操作" : "Chart interaction"}
            value={dragMode}
            onChange={(event) =>
              setDragMode(event.target.value as "zoom" | "pan")
            }
          >
            <option value="zoom">{zh ? "缩放" : "Zoom"}</option>
            <option value="pan">{zh ? "平移" : "Pan"}</option>
          </select>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              if (plot.current && element.current)
                void plot.current.relayout(element.current, {
                  "xaxis.autorange": true,
                  "yaxis.autorange": true,
                });
            }}
          >
            {zh ? "重置" : "Reset"}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              if (plot.current && element.current)
                void plot.current.downloadImage(element.current, {
                  format: "svg",
                  width: 1000,
                  height: 600,
                  filename: title,
                });
            }}
            aria-label={`${zh ? "下载" : "Download"} ${title} SVG`}
          >
            SVG ↓
          </button>
        </div>
      </header>
      {error && (
        <p role="alert">
          {zh
            ? "交互图表加载失败，请刷新页面。"
            : "Interactive chart could not load. Please refresh the page."}
        </p>
      )}
      <div
        ref={element}
        className="simulation-interactive-plot"
        role="application"
        aria-label={title}
        style={{ minHeight: height }}
      />
    </section>
  );
}
