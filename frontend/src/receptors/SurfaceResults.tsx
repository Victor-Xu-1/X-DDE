import { useState } from "react";
import { artifactUrl } from "../api";
import { StructureViewer } from "../viewer/StructureViewer";
import {
  ResearchTable,
  type ResearchColumn,
} from "../presentation/ResearchTable";
import { Hint } from "../guided/Hint";
import type { Job, Language } from "../types";
import {
  surfaceKey,
  surfaceLabel,
  type SurfaceResult,
  type SurfaceRow,
} from "./surface-types";
import "./surface.css";
export function SurfaceResults({
  job,
  result,
  language,
}: {
  job: Job;
  result: SurfaceResult;
  language: Language;
}) {
  const zh = language === "zh",
    [focus, setFocus] = useState<{ residue: string; nonce: number } | null>(
      null,
    );
  const percentage =
    result.isolated_area > 0
      ? (100 * result.assembly_area) / result.isolated_area
      : null;
  const columns: ResearchColumn<SurfaceRow>[] = [
    {
      key: "residue",
      label: zh ? "配体 / 残基" : "Ligand / residue",
      value: surfaceLabel,
    },
    {
      key: "assembly",
      label: zh ? "整体中暴露（Å²）" : "Exposed in context (Å²)",
      value: (r) => r.assembly_area,
      numeric: true,
      render: (r) => r.assembly_area.toFixed(2),
    },
    {
      key: "buried",
      label: zh ? "被遮挡（Å²）" : "Occluded (Å²)",
      value: (r) => r.buried_area,
      numeric: true,
      render: (r) => r.buried_area.toFixed(2),
    },
    {
      key: "isolated",
      label: zh ? "独立区域（Å²）" : "Isolated region (Å²)",
      value: (r) => r.isolated_area,
      numeric: true,
      render: (r) => r.isolated_area.toFixed(2),
    },
  ];
  function locate(r: SurfaceRow) {
    setFocus((v) => ({
      residue: `${r.chain}:${r.resname}:${r.number}:${r.insertion_code}`,
      nonce: (v?.nonce ?? 0) + 1,
    }));
  }
  return (
    <section className="surface-results">
      <div className="surface-result-heading">
        <h3>{zh ? "区域暴露与埋藏" : "Region exposure and burial"}</h3>
        <Hint
          label={
            zh
              ? "如何理解暴露与埋藏？"
              : "How to interpret exposure and burial?"
          }
        >
          {zh
            ? "暴露是在整体结构中仍可被探针接触的面积；遮挡是相对独立区域减少的面积。暴露比例以同一选区的独立状态为分母，不是相对标准氨基酸最大面积，也不是亲和力或连接臂通行概率。"
            : "Exposed area remains probe-accessible in context. Occlusion is the loss relative to the isolated selected region. The fraction uses that region's isolated area, not a standard residue maximum; it is neither affinity nor a linker passage probability."}
        </Hint>
      </div>
      <dl className="surface-summary">
        <div>
          <dt>{zh ? "整体中暴露" : "Exposed in context"}</dt>
          <dd>
            {result.assembly_area.toFixed(1)} <small>Å²</small>
          </dd>
        </div>
        <div>
          <dt>{zh ? "被周围结构遮挡" : "Occluded by context"}</dt>
          <dd>
            {result.buried_area.toFixed(1)} <small>Å²</small>
          </dd>
        </div>
        <div>
          <dt>
            {zh ? "相对独立状态的暴露比例" : "Fraction relative to isolation"}
          </dt>
          <dd>{percentage === null ? "—" : percentage.toFixed(1) + "%"}</dd>
        </div>
      </dl>
      {percentage !== null && (
        <div
          className="surface-area-bar"
          role="img"
          aria-label={
            (zh ? "暴露比例 " : "Exposed fraction ") +
            percentage.toFixed(1) +
            "%"
          }
        >
          <span
            style={{ width: Math.max(0, Math.min(100, percentage)) + "%" }}
          />
        </div>
      )}
      <div className="surface-result-layout">
        <StructureViewer
          urls={[artifactUrl(job.id, result.preview_artifact)]}
          language={language}
          focusResidue={focus}
        />
        <div>
          <ResearchTable
            rows={result.residues}
            columns={columns}
            rowId={surfaceKey}
            language={language}
            title={zh ? "区域面积" : "Region areas"}
            onSelect={locate}
            selected={
              focus
                ? (() => {
                    const row = result.residues.find(
                      (r) =>
                        `${r.chain}:${r.resname}:${r.number}:${r.insertion_code}` ===
                        focus.residue,
                    );
                    return row ? surfaceKey(row) : null;
                  })()
                : null
            }
            compare={false}
            exportName="region-exposure.csv"
          />
        </div>
      </div>
      <div className="surface-downloads">
        <a href={artifactUrl(job.id, "regions.csv")} download>
          {zh ? "下载区域面积" : "Download region areas"}
        </a>
        <a href={artifactUrl(job.id, "atoms.csv")} download>
          {zh ? "下载原子面积" : "Download atom areas"}
        </a>
        <a href={artifactUrl(job.id, result.preview_artifact)} download>
          {zh ? "下载分析结构" : "Download analyzed structure"}
        </a>
      </div>
      <details>
        <summary>
          {zh ? "测量条件与原子明细" : "Conditions and atom details"}
        </summary>
        <p>
          Shrake–Rupley · {result.options.probe_radius_angstrom} Å ·{" "}
          {result.options.sphere_points}{" "}
          {zh ? "采样点 / 原子" : "points / atom"}
        </p>
        <ResearchTable<SurfaceResult["atoms"][number]>
          rows={result.atoms}
          columns={[
            ...columns,
            { key: "atom", label: zh ? "原子" : "Atom", value: (r) => r.atom },
          ]}
          rowId={(r) => surfaceKey(r) + r.atom}
          language={language}
          title={zh ? "原子面积" : "Atom areas"}
          compare={false}
          exportName="atom-exposure.csv"
        />
      </details>
    </section>
  );
}
