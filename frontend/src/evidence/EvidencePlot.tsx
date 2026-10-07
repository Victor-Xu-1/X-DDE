import type { Language } from "../types";
import type { Observation } from "./types";
export function EvidencePlot({
  rows,
  language,
  onSelect,
}: {
  rows: Observation[];
  language: Language;
  onSelect(row: Observation): void;
}) {
  const zh = language === "zh";
  const logarithmic = rows[0]?.normalized_unit === "nM";
  const numeric = rows
    .filter(
      (r) =>
        r.normalized_value !== null && (!logarithmic || r.normalized_value > 0),
    )
    .slice(0, 50);
  if (!numeric.length) return null;
  const linearScale = Math.max(
    1,
    ...numeric.map((row) => Math.abs(row.normalized_value!)),
  );
  const project = (value: number) =>
    logarithmic ? Math.log10(value) : value / linearScale;
  const unproject = (value: number) =>
    logarithmic ? 10 ** value : value * linearScale;
  const logs = numeric.map((r) => project(r.normalized_value!));
  const min = Math.floor(Math.min(...logs)),
    max = Math.max(min + 1, Math.ceil(Math.max(...logs)));
  const left = 172,
    right = 635,
    height = 60 + numeric.length * 25;
  const x = (value: number) =>
    left + ((project(value) - min) / (max - min)) * (right - left);
  const ticks = Array.from(
    { length: Math.min(8, max - min + 1) },
    (_, i) => min + (i * (max - min)) / Math.min(7, max - min),
  );
  return (
    <div className="evidence-plot">
      <p>
        {zh ? "实测值与报告限值" : "Reported measurements and limits"} ·{" "}
        {numeric[0].normalized_unit}
        {rows.length > 50 && (
          <small>
            {" "}
            ·{" "}
            {zh
              ? "图中最多显示 50 条，表格保留全部记录"
              : "Plot shows up to 50 observations; table retains all records"}
          </small>
        )}
      </p>
      <div className="evidence-plot-scroll">
        <svg
          viewBox={`0 0 680 ${height}`}
          role="img"
          aria-label={
            zh
              ? "同条件实测值对比图"
              : "Condition-matched reported measurement plot"
          }
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={x(unproject(t))}
                x2={x(unproject(t))}
                y1={20}
                y2={height - 25}
                stroke="var(--border)"
              />
              <text x={x(unproject(t))} y={height - 7} textAnchor="middle">
                {unproject(t).toPrecision(3)}
              </text>
            </g>
          ))}
          {numeric.map((r, i) => (
            <g
              key={r.id}
              tabIndex={0}
              role="button"
              aria-label={`${r.compound} ${r.relation} ${r.reported_value} ${r.reported_unit}`}
              onClick={() => onSelect(r)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(r);
                }
              }}
            >
              <title>
                {r.compound} · {r.relation} {r.reported_value} {r.reported_unit}
              </title>
              <text x={left - 10} y={34 + i * 25} textAnchor="end">
                {r.compound.slice(0, 21)}
              </text>
              {r.relation === "=" ? (
                <circle
                  cx={x(r.normalized_value!)}
                  cy={30 + i * 25}
                  r={4}
                  fill="var(--primary)"
                />
              ) : (
                <text
                  x={x(r.normalized_value!)}
                  y={35 + i * 25}
                  textAnchor="middle"
                  fill="var(--primary)"
                >
                  {r.relation === "~"
                    ? "≈"
                    : r.relation.startsWith("<")
                      ? "◀"
                      : "▶"}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
