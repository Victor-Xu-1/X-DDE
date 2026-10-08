import { useRef, useState } from "react";
import { SvgFigureExport } from "../publication/SvgFigureExport";
import type { Language } from "../types";
import type { PoseClusterResult, ClusterPair } from "./cluster-types";
export function ClusterMatrix({
  value,
  language,
  onSelect,
}: {
  value: PoseClusterResult;
  language: Language;
  onSelect(pair: ClusterPair): void;
}) {
  const zh = language === "zh",
    [metric, setMetric] = useState<"rmsd_angstrom" | "contact_jaccard">(
      "rmsd_angstrom",
    ),
    svg = useRef<SVGSVGElement>(null),
    size = value.rows.length * 26 + 42;
  const pairs = new Map(value.pairs.map((p) => [p.left + ":" + p.right, p]));
  return (
    <section className="cluster-matrix">
      <div className="editor-toolbar">
        <label className="field">
          {zh ? "姿势比较图" : "Pose comparison map"}
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as typeof metric)}
          >
            <option value="rmsd_angstrom">
              {zh ? "三维差异（Å）" : "3D difference (Å)"}
            </option>
            <option value="contact_jaccard">
              {zh ? "残基接触相似度" : "Residue contact similarity"}
            </option>
          </select>
        </label>
        <SvgFigureExport
          language={language}
          source={() => svg.current}
          filename={"binding-modes"}
        />
      </div>
      <div className="cluster-matrix-scroll">
        <svg
          ref={svg}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={zh ? "结合模式两两比较" : "Pairwise binding modes"}
        >
          {value.rows.map((row) => (
            <g key={row.index} fill="var(--muted)" fontSize="10">
              <text x={48 + row.index * 26} y="16" textAnchor="middle">
                {row.index + 1}
              </text>
              <text x="22" y={50 + row.index * 26} textAnchor="end">
                {row.index + 1}
              </text>
            </g>
          ))}
          {value.rows.flatMap((left) =>
            value.rows.map((right) => {
              const pair = pairs.get(
                Math.min(left.index, right.index) +
                  ":" +
                  Math.max(left.index, right.index),
              );
              const numeric = pair?.[metric],
                unknown = numeric == null;
              const strength = unknown
                ? 0
                : metric === "contact_jaccard"
                  ? numeric
                  : 1 -
                    Math.min(1, numeric / value.options.maximum_rmsd_angstrom);
              const title =
                left.index === right.index
                  ? zh
                    ? "同一姿势"
                    : "Same pose"
                  : (zh ? "姿势 " : "Pose ") +
                    (left.index + 1) +
                    " / " +
                    (right.index + 1) +
                    " · " +
                    (unknown
                      ? zh
                        ? "未知"
                        : "Unknown"
                      : numeric.toFixed(3) +
                        (metric === "rmsd_angstrom" ? " Å" : ""));
              return (
                <g
                  key={left.index + ":" + right.index}
                  role={pair ? "button" : undefined}
                  tabIndex={pair ? 0 : undefined}
                  aria-label={title}
                  onClick={() => pair && onSelect(pair)}
                  onKeyDown={(e) => {
                    if (pair && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onSelect(pair);
                    }
                  }}
                >
                  <title>{title}</title>
                  <rect
                    x={36 + right.index * 26}
                    y={30 + left.index * 26}
                    width="24"
                    height="24"
                    fill={
                      left.index === right.index
                        ? "var(--surface-muted)"
                        : unknown
                          ? "var(--line)"
                          : `color-mix(in srgb, var(--accent) ${Math.round(20 + strength * 80)}%, var(--surface))`
                    }
                  />
                  {unknown && pair && (
                    <text
                      x={48 + right.index * 26}
                      y={46 + left.index * 26}
                      textAnchor="middle"
                      fontSize="10"
                      fill="var(--muted)"
                    >
                      ?
                    </text>
                  )}
                </g>
              );
            }),
          )}
        </svg>
      </div>
      <small>
        {zh
          ? "深色：更相似 · ?：证据不足；点击方格查看对应姿势。"
          : "Darker: more similar · ?: insufficient evidence. Select a cell to inspect the poses."}
      </small>
    </section>
  );
}
