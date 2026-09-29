import { useEffect, useRef, useState } from "react";
import { artifactUrl, request } from "../api";
import type { Language } from "../types";
interface Confidence {
  metric: string;
  token_count: number;
  indices: number[];
  stride: number;
  matrix: number[][];
  atom_plddt: { index: number; value: number }[];
  atom_stride: number;
  native_artifact: string;
}
export function ConfidencePanel({
  jobId,
  candidate,
  language,
}: {
  jobId: string;
  candidate: string;
  language: Language;
}) {
  const zh = language === "zh",
    [metric, setMetric] = useState("pae"),
    [data, setData] = useState<Confidence | null>(null),
    [error, setError] = useState(""),
    [hover, setHover] = useState(""),
    canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    void request<Confidence>(
      `/jobs/${jobId}/confidence?${new URLSearchParams({ candidate, metric })}`,
      { signal: c.signal },
    )
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [jobId, candidate, metric]);
  useEffect(() => {
    if (!data || !canvas.current) return;
    const ctx = canvas.current.getContext("2d");
    if (!ctx) return;
    const n = data.matrix.length;
    canvas.current.width = n;
    canvas.current.height = n;
    const image = ctx.createImageData(n, n);
    data.matrix.forEach((row, y) =>
      row.forEach((v, x) => {
        const t = Math.max(
            0,
            Math.min(1, v / (metric === "contacts" ? 1 : 30)),
          ),
          i = (y * n + x) * 4;
        image.data[i] = Math.round(245 - 210 * (1 - t));
        image.data[i + 1] = Math.round(250 - 120 * (1 - t));
        image.data[i + 2] = Math.round(250 - 40 * (1 - t));
        image.data[i + 3] = 255;
      }),
    );
    ctx.putImageData(image, 0, 0);
  }, [data, metric]);
  return (
    <section className="studio-panel confidence-panel">
      <h3>{zh ? "原生置信度与误差图" : "Native confidence and error maps"}</h3>
      <label className="field">
        {zh ? "查看指标" : "Metric"}
        <select value={metric} onChange={(e) => setMetric(e.target.value)}>
          <option value="pae">PAE · {zh ? "对齐误差" : "Aligned error"}</option>
          <option value="pde">
            PDE · {zh ? "距离误差" : "Distance error"}
          </option>
          <option value="contacts">
            {zh ? "接触概率" : "Contact probability"}
          </option>
        </select>
      </label>
      <p className="small">
        {zh
          ? "PAE/PDE 单位为 Å，越低通常越确定；接触概率范围为 0–1。坐标为原生 token 索引，不等同于 PDB 残基编号。"
          : "PAE/PDE are in Å; lower usually indicates greater certainty. Contact probabilities range from0 to1. Axes use native token indices, not PDB residue numbers."}
      </p>
      {error ? (
        <p role="status" className="notice">
          {error}
        </p>
      ) : !data ? (
        <p role="status">{zh ? "读取中…" : "Loading…"}</p>
      ) : (
        <>
          <canvas
            ref={canvas}
            className="confidence-map"
            aria-label={zh ? "置信度矩阵热图" : "Confidence matrix heatmap"}
            role="img"
            onMouseMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect(),
                n = data.matrix.length,
                x = Math.min(
                  n - 1,
                  Math.floor(((e.clientX - box.left) / box.width) * n),
                ),
                y = Math.min(
                  n - 1,
                  Math.floor(((e.clientY - box.top) / box.height) * n),
                );
              setHover(
                `${data.indices[y]} × ${data.indices[x]}: ${data.matrix[y][x].toFixed(3)}`,
              );
            }}
          />
          <p aria-live="polite">
            {hover || `${data.token_count} tokens`} ·{" "}
            {zh ? "采样间隔" : "Sampling stride"} {data.stride}
          </p>
          <div className="plddt-spark" role="img" aria-label="Atom pLDDT">
            <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
              <polyline
                fill="none"
                stroke="#1768ef"
                strokeWidth="1.5"
                points={data.atom_plddt
                  .map(
                    (a, i) =>
                      `${(i / Math.max(1, data.atom_plddt.length - 1)) * 1000},${100 - a.value}`,
                  )
                  .join(" ")}
              />
            </svg>
          </div>
          <p className="small">
            {zh
              ? "逐原子 pLDDT（0–100）。大数组按显示间隔取样；原始值可下载。"
              : "Atom pLDDT (0–100). Large arrays are sampled for display; download original values below."}
          </p>
          <a href={artifactUrl(jobId, data.native_artifact)} download>
            {zh ? "下载完整原生置信度" : "Download full native confidence"}
          </a>
        </>
      )}
    </section>
  );
}
