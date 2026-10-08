import type { Language } from "../types";
import { InteractivePlot } from "./InteractivePlot";

export function OverlapHeatmap({
  matrix,
  language,
}: {
  matrix: number[][];
  language: Language;
}) {
  const states = matrix.map((_, i) => i);
  return (
    <div className="fep-heatmap">
      <InteractivePlot
        title={language === "zh" ? "采样重叠" : "Sampling overlap"}
        language={language}
        height={350}
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
            },
            hovertemplate: "λ %{y} → λ %{x}<br>MBAR: %{z:.4f}<extra></extra>",
          },
        ]}
        layout={{
          showlegend: false,
          margin: { l: 50, r: 60, t: 14, b: 48 },
          xaxis: { title: { text: "λ state" }, dtick: 1, constrain: "domain" },
          yaxis: {
            title: { text: "λ state" },
            dtick: 1,
            autorange: "reversed",
            scaleanchor: "x",
          },
        }}
      />
      <p className="field-help">
        {language === "zh"
          ? "深色表示重叠较高；相邻状态重叠过低需要增加采样或调整方案。"
          : "Darker cells indicate more overlap. Low adjacent-state overlap requires further sampling or protocol review."}
      </p>
    </div>
  );
}
