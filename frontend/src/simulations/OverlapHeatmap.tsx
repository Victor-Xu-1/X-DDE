import type { Language } from "../types";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";
import { AdjacentOverlapTable } from "./AdjacentOverlapTable";
import { adjacentOverlap } from "./overlap-data";
import "./overlap.css";

export function OverlapHeatmap({
  matrix,
  language,
}: {
  matrix: number[][] | undefined;
  language: Language;
}) {
  const rows = adjacentOverlap(matrix);
  if (!matrix || !rows)
    return (
      <p role="status">
        {language === "zh"
          ? "当前重复没有有效的采样重叠矩阵。"
          : "No valid sampling-overlap matrix is available for this repeat."}
      </p>
    );
  const states = matrix.map((_, i) => i);
  return (
    <div className="fep-heatmap">
      <div className="fep-overlap-figure">
        <InteractivePlot
          title={language === "zh" ? "采样重叠" : "Sampling overlap"}
          language={language}
          height={460}
          data={[
            {
              type: "heatmap",
              x: states,
              y: states,
              z: matrix,
              zmin: 0,
              zmax: 1,
              colorscale: [
                [0, "#f5f7ff"],
                [0.1, "#c2d6ee"],
                [0.5, "#658cce"],
                [1, "#364f9b"],
              ],
              colorbar: {
                title: { text: language === "zh" ? "重叠" : "Overlap" },
                thickness: 12,
                x: 1.01,
              },
              hovertemplate:
                (language === "zh" ? "状态 " : "State ") +
                "%{y} → %{x}<br>MBAR: %{z:.4f}<extra></extra>",
            },
          ]}
          layout={{
            showlegend: false,
            margin: { l: 50, r: 60, t: 14, b: 48 },
            xaxis: {
              title: {
                text: language === "zh" ? "λ 状态编号" : "λ state index",
              },
              dtick: states.length > 24 ? Math.ceil(states.length / 16) : 1,
              range: [-0.5, states.length - 0.5],
              constrain: "domain",
            },
            yaxis: {
              title: {
                text: language === "zh" ? "λ 状态编号" : "λ state index",
              },
              dtick: states.length > 24 ? Math.ceil(states.length / 16) : 1,
              range: [states.length - 0.5, -0.5],
              scaleanchor: "x",
              constrain: "domain",
            },
          }}
        />
        <p className="field-help">
          {language === "zh"
            ? "深色表示重叠较高；相邻状态重叠过低需要增加采样或调整方案。"
            : "Darker cells indicate more overlap. Low adjacent-state overlap requires further sampling or protocol review."}
        </p>
      </div>
      <AdjacentOverlapTable rows={rows} language={language} />
    </div>
  );
}
