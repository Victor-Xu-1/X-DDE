import { useId } from "react";
import type { Language } from "../types";
import { edgeLabels, objectLabels, type ResearchGraph } from "./types";

export function neighborhood(
  graph: ResearchGraph,
  selected: string | null,
  limit = 24,
) {
  if (!selected) return graph.nodes.slice(0, limit);
  const ids = new Set([selected]);
  for (const edge of graph.edges)
    if (edge.source === selected || edge.target === selected) {
      ids.add(edge.source);
      ids.add(edge.target);
    }
  return graph.nodes.filter((node) => ids.has(node.id)).slice(0, limit);
}
export function RelationshipGraph({
  graph,
  selected,
  language,
  onSelect,
}: {
  graph: ResearchGraph;
  selected: string | null;
  language: Language;
  onSelect(id: string): void;
}) {
  const zh = language === "zh",
    marker = useId().replaceAll(":", "");
  const nodes = neighborhood(graph, selected);
  const columns = [
    nodes.filter((n) => n.kind === "file"),
    nodes.filter((n) => !["task", "file"].includes(n.kind)),
    nodes.filter((n) => n.kind === "task"),
  ].filter((column) => column.length);
  const width = Math.max(310, columns.length * 310);
  const height = Math.max(114, ...columns.map((c) => c.length * 74 + 40));
  const positions = new Map(
    columns.flatMap((column, col) =>
      column.map(
        (node, row) =>
          [node.id, { x: 18 + col * 310, y: 20 + row * 74 }] as const,
      ),
    ),
  );
  return (
    <div className="research-graph-scroll">
      <svg
        className="research-graph"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="group"
        aria-label={zh ? "科学资产关系图" : "Scientific asset relationships"}
      >
        <defs>
          <marker
            id={marker}
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8" fill="currentColor" />
          </marker>
        </defs>
        {graph.edges.map((edge, i) => {
          const a = positions.get(edge.source),
            b = positions.get(edge.target);
          if (!a || !b) return null;
          const sameColumn = a.x === b.x,
            forward = a.x < b.x;
          const ax = a.x + (sameColumn || forward ? 270 : 0),
            ay = a.y + 26,
            bx = b.x + (sameColumn || !forward ? 270 : 0),
            by = b.y + 26;
          return (
            <g key={i} className="relationship-edge">
              <path
                d={`M${ax},${ay} C${ax + (sameColumn ? 35 : forward ? 20 : -20)},${ay} ${bx + (sameColumn ? 35 : forward ? -20 : 20)},${by} ${bx},${by}`}
                markerEnd={`url(#${marker})`}
              />
              <title>
                {edgeLabels[edge.relation]?.[zh ? 0 : 1] ?? edge.relation}
              </title>
            </g>
          );
        })}
        {nodes.map((node) => {
          const position = positions.get(node.id)!;
          return (
            <g
              key={node.id}
              transform={`translate(${position.x},${position.y})`}
              className={`relationship-node ${selected === node.id ? "selected" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`${objectLabels[node.kind]?.[zh ? 0 : 1]}: ${node.label}`}
              onClick={() => onSelect(node.id)}
              onKeyDown={(e) => {
                if (["Enter", " "].includes(e.key)) {
                  e.preventDefault();
                  onSelect(node.id);
                }
              }}
            >
              <rect width="270" height="54" rx="10" />
              <text x="12" y="20" className="graph-kind">
                {objectLabels[node.kind]?.[zh ? 0 : 1]} {node.status ?? ""}
              </text>
              <text x="12" y="40">
                {node.label.length > 30
                  ? node.label.slice(0, 29) + "…"
                  : node.label}
              </text>
              <title>{node.label}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
