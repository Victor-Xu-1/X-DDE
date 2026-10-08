import { useRef } from "react";
import { SvgFigureExport } from "../publication/SvgFigureExport";
import type { Language } from "../types";
import type { Channel } from "./types";
export function ChannelProfile({
  channel,
  language,
}: {
  channel: Channel;
  language: Language;
}) {
  const ref = useRef<SVGSVGElement>(null),
    zh = language === "zh";
  const points = channel.points,
    last = points.at(-1)!.sample_polyline_distance_angstrom;
  const max = Math.max(...points.map((p) => p.radius_angstrom)) * 1.12;
  const x = (v: number) => 48 + (v / Math.max(last, 0.001)) * 390,
    y = (v: number) => 205 - (v / max) * 166;
  const narrow = points.reduce((a, b) =>
    a.radius_angstrom < b.radius_angstrom ? a : b,
  );
  const path = points
    .map(
      (p, i) =>
        `${i ? "L" : "M"} ${x(p.sample_polyline_distance_angstrom)} ${y(p.radius_angstrom)}`,
    )
    .join(" ");
  return (
    <div className="channel-profile">
      <div className="channel-profile-heading">
        <h4>{zh ? "沿路径的可用半径" : "Available radius along path"}</h4>
        <SvgFigureExport
          language={language}
          source={() => ref.current}
          filename={"channel-radius-profile"}
        />
      </div>
      <svg
        ref={ref}
        viewBox="0 0 470 256"
        role="img"
        aria-label={
          zh
            ? "通道半径曲线，横轴为实际采样路径距离"
            : "Channel radius profile against actual sampled path distance"
        }
      >
        <rect width="470" height="256" fill="#ffffff" />
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={48}
              x2={438}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="#e7ecf2"
            />
            <text
              x={40}
              y={y(max * f) + 4}
              textAnchor="end"
              fill="#627181"
              fontSize={11}
            >
              {(max * f).toFixed(1)}
            </text>
          </g>
        ))}
        <path d={`${path} L ${x(last)} 205 L 48 205 Z`} fill="#e8f2fd" />
        <path d={path} stroke="#4b82e4" strokeWidth={2.5} fill="none" />
        <circle
          cx={x(narrow.sample_polyline_distance_angstrom)}
          cy={y(narrow.radius_angstrom)}
          r={4}
          fill="#df9b3e"
        />
        <text x={48} y={23} fill="#627181" fontSize={11}>
          {zh ? "半径（Å）" : "Radius (Å)"}
        </text>
        <text x={48} y={224} fill="#627181" fontSize={11}>
          0
        </text>
        <text x={438} y={224} textAnchor="end" fill="#627181" fontSize={11}>
          {last.toFixed(1)}
        </text>
        <text x={243} y={246} textAnchor="middle" fill="#627181" fontSize={11}>
          {zh ? "采样路径距离（Å）" : "Sampled polyline distance (Å)"}
        </text>
      </svg>
    </div>
  );
}
