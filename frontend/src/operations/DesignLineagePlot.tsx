import { useState } from "react";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";
import type { Language } from "../types";
import { designLineage } from "./design-lineage";

export function DesignLineagePlot({
  value,
  language,
}: {
  value: Record<string, unknown>;
  language: Language;
}) {
  const zh = language === "zh",
    [selected, setSelected] = useState("");
  let model;
  try {
    model = designLineage(value);
  } catch {
    return (
      <p role="alert">
        {zh
          ? "谱系记录暂时无法完整显示，请下载原始结果核对。"
          : "The lineage cannot be displayed completely; inspect the original result."}
      </p>
    );
  }
  if (!model.nodes.length)
    return (
      <p className="field-help">
        {zh
          ? "本次结果没有提供明确的父子路径；候选数和变异记录仍可查看。"
          : "No explicit parent–child paths were provided; candidate counts and mutations remain available."}
      </p>
    );
  const nodes = model.nodes,
    byId = new Map(nodes.map((node) => [node.id, node]));
  const active = byId.get(selected) ?? nodes[0];
  const parents = model.edges
    .filter((edge) => edge.child === active.id)
    .map((edge) => edge.parent);
  const x = model.edges.flatMap((edge) => [
    byId.get(edge.parent)!.depth,
    byId.get(edge.child)!.depth,
    null,
  ]);
  const y = model.edges.flatMap((edge) => [
    byId.get(edge.parent)!.y,
    byId.get(edge.child)!.y,
    null,
  ]);
  return (
    <section className="design-lineage-view">
      <InteractivePlot
        title={zh ? "候选设计谱系" : "Candidate design lineage"}
        height={340}
        language={language}
        data={[
          {
            type: "scatter",
            mode: "lines",
            x,
            y,
            line: { color: "#b9bed4", width: 2 },
            hoverinfo: "skip",
            showlegend: false,
          },
          {
            type: "scatter",
            mode: "text+markers",
            x: nodes.map((node) => node.depth),
            y: nodes.map((node) => node.y),
            text: nodes.map((node) => node.id),
            textposition: "top center",
            customdata: nodes.map((node) =>
              node.score === null
                ? zh
                  ? "未评分"
                  : "Not scored"
                : String(node.score),
            ),
            marker: {
              color: nodes.map((node) =>
                node.id === active.id ? "#5b3ef0" : "#0ca5a8",
              ),
              size: nodes.map((node) => (node.id === active.id ? 19 : 13)),
              line: { color: "#fff", width: 1.5 },
            },
            hovertemplate:
              "%{text}<br>" +
              (zh ? "目标分数" : "Objective score") +
              ": %{customdata}<extra></extra>",
            showlegend: false,
          },
        ]}
        layout={{
          xaxis: {
            title: { text: zh ? "设计步骤" : "Design step" },
            dtick: 1,
            range: [-0.4, Math.max(...nodes.map((node) => node.depth)) + 0.6],
            zeroline: false,
          },
          yaxis: {
            visible: false,
            range: [
              Math.min(...nodes.map((node) => node.y)) - 0.6,
              Math.max(...nodes.map((node) => node.y)) + 0.6,
            ],
          },
          margin: { l: 60, r: 90, t: 45, b: 55 },
        }}
        onPoint={(point) => {
          if (point.curveNumber === 1 && nodes[point.pointNumber])
            setSelected(nodes[point.pointNumber].id);
        }}
      />
      <label className="field">
        {zh ? "查看候选" : "Inspect candidate"}
        <select
          value={active.id}
          onChange={(event) => setSelected(event.target.value)}
        >
          {nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.id}
            </option>
          ))}
        </select>
      </label>
      <div className="result-summary-grid">
        <dl>
          <dt>{zh ? "目标分数" : "Objective score"}</dt>
          <dd>{active.score ?? (zh ? "未评分" : "Not scored")}</dd>
        </dl>
        <dl>
          <dt>{zh ? "父本" : "Parent"}</dt>
          <dd>
            {parents.join(" · ") || (zh ? "起始候选" : "Starting candidate")}
          </dd>
        </dl>
      </div>
      <p className="field-help">
        {zh ? "显示的分析分支：" : "Reported branches: "}
        {model.paths} / {model.total}
        {zh
          ? "。图示设计关系，横轴不是生物进化距离；改善与下降分支均保留。"
          : ". This is a design relationship, not biological evolutionary distance. Improving and declining paths are both retained."}
      </p>
    </section>
  );
}
