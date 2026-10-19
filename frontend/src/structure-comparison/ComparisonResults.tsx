import { ComparisonPreview } from "./ComparisonPreview";
import { ComparisonDownloads, ComparisonSources } from "./ComparisonFiles";
import { useState } from "react";
import { Hint } from "../guided/Hint";
import { ResearchHandoff } from "../guided/ResearchHandoff";
import { PocketForm } from "../pockets/PocketForm";
import {
  ResearchTable,
  type ResearchColumn,
} from "../presentation/ResearchTable";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import type { Job, Language } from "../types";
import { CoverageTable, InterfaceTable } from "./ComparisonEvidenceTables";
import { DisplacementPlot } from "./DisplacementPlot";
import {
  addressLabel,
  displacementId,
  type ComparisonResult,
  type Displacement,
} from "./types";
import "./comparison.css";

export function ComparisonResults({
  job,
  result,
  language,
  onCreated,
}: {
  job: Job;
  result: ComparisonResult;
  language: Language;
  onCreated?(job: Job): void;
}) {
  const zh = language === "zh",
    data = result.geometry;
  const [tab, setTab] = useState<
    "displacements" | "interfaces" | "coverage" | "sources"
  >("displacements");
  const [selection, setSelection] = useState<Displacement | null>(null),
    [handoff, setHandoff] = useState(false);
  const columns: ResearchColumn<Displacement>[] = [
    {
      key: "role",
      label: zh ? "角色" : "Role",
      value: (r) =>
        r.role === "target"
          ? zh
            ? "靶蛋白"
            : "Target"
          : zh
            ? "伙伴"
            : "Partner",
    },
    {
      key: "reference",
      label: zh ? "参照残基" : "Reference residue",
      value: (r) => addressLabel(r.reference) + " " + r.reference_letter,
    },
    {
      key: "moving",
      label: zh ? "比较残基" : "Comparison residue",
      value: (r) => addressLabel(r.moving) + " " + r.moving_letter,
    },
    {
      key: "displacement",
      label: zh ? "位移（Å）" : "Displacement (Å)",
      numeric: true,
      value: (r) => r.displacement_angstrom,
    },
  ];
  const saved = result.derived_references?.moving;
  if (handoff && saved && onCreated)
    return (
      <ResearchHandoff language={language} onBack={() => setHandoff(false)}>
        <PocketForm
          language={language}
          initialProtein={saved}
          onCreated={onCreated}
          onPredict={() => setHandoff(false)}
        />
      </ResearchHandoff>
    );
  return (
    <section
      className="comparison-result-view"
      aria-label={
        zh ? "蛋白结构比较结果" : "Protein structure comparison results"
      }
    >
      <StructureWorkbench
        preview={
          <ComparisonPreview
            jobId={job.id}
            language={language}
            selection={selection}
            onClear={() => setSelection(null)}
            onUse={saved && onCreated ? () => setHandoff(true) : undefined}
          />
        }
      >
        <dl className="comparison-result-metrics">
          <div>
            <dt>{zh ? "靶蛋白对齐 RMSD" : "Target-fit RMSD"}</dt>
            <dd>{data.target_rmsd_angstrom.toFixed(3)} Å</dd>
            <small>
              {data.matched_target_ca} {zh ? "个匹配 Cα" : "matched Cα"}
            </small>
          </div>
          <div>
            <dt>
              {zh
                ? "靶蛋白对齐后的伙伴 RMSD"
                : "Target-conditioned partner RMSD"}
            </dt>
            <dd>{data.partner_rmsd_angstrom.toFixed(3)} Å</dd>
            <small>
              {data.matched_partner_ca} {zh ? "个匹配 Cα" : "matched Cα"}
            </small>
          </div>
        </dl>
        <div
          className="comparison-preview-actions"
          role="group"
          aria-label={zh ? "比较分析" : "Comparison analysis"}
        >
          {(
            ["displacements", "interfaces", "coverage", "sources"] as const
          ).map((value) => (
            <button
              key={value}
              type="button"
              className="secondary-button"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {
                {
                  displacements: zh ? "残基位移" : "Residue displacement",
                  interfaces: zh ? "界面" : "Interfaces",
                  coverage: zh ? "覆盖率" : "Coverage",
                  sources: zh ? "结构来源" : "Sources",
                }[value]
              }
            </button>
          ))}
        </div>
        <Hint
          label={zh ? "结构比较的解释" : "Interpreting structural comparisons"}
        >
          {result.options.purpose === "conformational_comparison"
            ? zh
              ? "不同功能状态之间的几何差异不等于预测错误；这些指标不代表亲和力或活性。"
              : "Geometric differences between functional states do not imply prediction error. These metrics do not measure affinity or activity."
            : zh
              ? "结果只适用于所选参照、链对应和观测残基；不能代替实验验证。"
              : "Results are conditioned on the selected reference, mapping and observed residues; they do not replace experimental validation."}
        </Hint>
        {tab === "displacements" && (
          <>
            <DisplacementPlot
              rows={data.residue_displacements}
              language={language}
              onSelect={setSelection}
            />
            <ResearchTable
              rows={data.residue_displacements}
              columns={columns}
              rowId={displacementId}
              selected={selection ? displacementId(selection) : null}
              onSelect={setSelection}
              compare={false}
              title={zh ? "逐残基比较" : "Per-residue comparison"}
              language={language}
              exportName="selected-residue-displacements.csv"
            />
          </>
        )}
        {tab === "interfaces" && (
          <InterfaceTable result={result} language={language} />
        )}
        {tab === "coverage" && (
          <CoverageTable result={result} language={language} />
        )}
        {tab === "sources" && (
          <ComparisonSources
            jobId={job.id}
            result={result}
            language={language}
          />
        )}
        <ComparisonDownloads jobId={job.id} language={language} />
      </StructureWorkbench>
    </section>
  );
}
