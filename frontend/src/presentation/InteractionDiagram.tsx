import { useRef, useState } from "react";
import type { Language } from "../types";
import { SvgFigureExport } from "../publication/SvgFigureExport";
import { Hint } from "../guided/Hint";
export interface InteractionEdge {
  left: string;
  right: string;
  kind: string;
  distance: number | null;
}
const colors: Record<string, string> = {
  hydrophobic: "#b38b30",
  hbond: "#3b82b0",
  saltbridge: "#bd5b61",
  pistack: "#8662ae",
  pication: "#518873",
};
const labels: Record<string, string> = {
  hydrophobic: "疏水接触",
  hbond: "氢键",
  saltbridge: "盐桥",
  pistack: "芳环堆积",
  pication: "阳离子–π",
};
export function InteractionDiagram({
  edges,
  label,
  language,
  onSelect,
}: {
  edges: InteractionEdge[];
  label: string;
  language: Language;
  onSelect?(edge: InteractionEdge): void;
}) {
  const zh = language === "zh",
    view = useRef<SVGSVGElement>(null);
  const [limit, setLimit] = useState(8),
    [showDistance, setShowDistance] = useState(true);
  const shown = edges.slice(0, limit);
  if (!edges.length) return null;
  return (
    <section className="interaction-diagram result-section-card">
      <header className="evidence-material-toolbar">
        <h3>
          {zh ? "接触关系图" : "Contact relationships"}
          <Hint label={zh ? "接触图说明" : "Contact diagram help"}>
            {zh
              ? "示意布局，不是二维原子映射。类型和距离来自接触记录；线条不表示作用能或亲和力。"
              : "Schematic layout, not a 2D atom map. Types and distances come from contact records; line width does not encode energy or affinity."}
          </Hint>
        </h3>
        <SvgFigureExport
          language={language}
          source={() => view.current}
          filename={label + "-contacts"}
        />
      </header>
      <div className="editor-toolbar">
        <label>
          {zh ? "显示接触" : "Contacts shown"}{" "}
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            <option value="5">{zh ? "前 5 项" : "First 5"}</option>
            <option value="8">{zh ? "8 项 · 推荐" : "8 · Recommended"}</option>
            <option value="20">{zh ? "前 20 项" : "First 20"}</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={showDistance}
            onChange={(e) => setShowDistance(e.target.checked)}
          />
          {zh ? "显示距离" : "Show distances"}
        </label>
      </div>
      <div className="contact-network-scroll">
        <svg
          ref={view}
          viewBox={"0 0 600 " + (shown.length * 52 + 40)}
          role="group"
          aria-label={
            zh ? "原生接触关系示意图" : "Native contact relationship diagram"
          }
          className="contact-network-svg"
        >
          <text
            x="102"
            y="22"
            textAnchor="middle"
            fontSize="11"
            fill="var(--muted)"
          >
            {zh ? "结合体残基" : "Binder residue"}
          </text>
          <text
            x="300"
            y="22"
            textAnchor="middle"
            fontSize="11"
            fill="var(--muted)"
          >
            {zh ? "接触类型与距离" : "Contact type and distance"}
          </text>
          <text
            x="498"
            y="22"
            textAnchor="middle"
            fontSize="11"
            fill="var(--muted)"
          >
            {zh ? "靶标残基" : "Target residue"}
          </text>
          {shown.map((edge, index) => {
            const y = 62 + index * 52;
            const color = colors[edge.kind] ?? "#81908a";
            return (
              <g
                key={index}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-label={edge.left + " → " + edge.right + " · " + edge.kind}
                onClick={() => onSelect?.(edge)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect?.(edge);
                  }
                }}
              >
                <line
                  x1="174"
                  y1={y}
                  x2="426"
                  y2={y}
                  stroke={color}
                  strokeWidth="1.8"
                  strokeDasharray="5 4"
                />
                {[
                  { x: 102, text: edge.left },
                  { x: 498, text: edge.right },
                ].map((node) => (
                  <g key={node.x}>
                    <rect
                      x={node.x - 72}
                      y={y - 18}
                      width="144"
                      height="36"
                      rx="8"
                      fill="var(--surface)"
                      stroke={color}
                    />
                    <text
                      x={node.x}
                      y={y + 4}
                      textAnchor="middle"
                      fontSize="12"
                      fill="var(--ink)"
                    >
                      {node.text}
                    </text>
                  </g>
                ))}
                <rect
                  x="205"
                  y={y - 22}
                  width="190"
                  height="40"
                  fill="var(--surface)"
                />
                <text
                  x="300"
                  y={y - 3}
                  textAnchor="middle"
                  fontSize="11"
                  fill={color}
                >
                  {zh ? (labels[edge.kind] ?? edge.kind) : edge.kind}
                </text>
                {showDistance && edge.distance !== null && (
                  <text
                    x="300"
                    y={y + 12}
                    textAnchor="middle"
                    fontSize="11"
                    fill="var(--muted)"
                  >
                    {edge.distance} Å
                  </text>
                )}
                <title>
                  {edge.left +
                    " → " +
                    edge.right +
                    " · " +
                    edge.kind +
                    (edge.distance !== null
                      ? " · " + edge.distance + " Å"
                      : "")}
                </title>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
