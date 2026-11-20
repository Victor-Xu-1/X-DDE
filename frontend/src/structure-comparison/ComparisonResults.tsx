import { ComparisonPreview } from "./ComparisonPreview";
import { matchedResidue } from "./AlignedStructurePair";
import { comparisonResultFiles, ComparisonSources } from "./ComparisonFiles";
import { useRef, useState } from "react";
import { Hint } from "../guided/Hint";
import { ResearchHandoff } from "../guided/ResearchHandoff";
import { PocketForm } from "../pockets/PocketForm";
import {
  ResearchTable,
  type ResearchColumn,
} from "../presentation/ResearchTable";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { SpatialResultSummary } from "../presentation/SpatialResultSummary";
import { ResearchTabs } from "../presentation/ResearchTabs";
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
import "./comparison-result-view.css";
import "../presentation/spatial-result-review.css";

type ComparisonResultProps = {
  job: Job;
  result: ComparisonResult;
  language: Language;
  onCreated?(job: Job): void;
};

export function ComparisonResults(props: ComparisonResultProps) {
  return <ComparisonResultWorkspace key={props.job.id} {...props} />;
}

function ComparisonResultWorkspace({
  job,
  result,
  language,
  onCreated,
}: ComparisonResultProps) {
  const zh = language === "zh",
    data = result.geometry;
  const previewHeader = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<Displacement | null>(null),
    [handoff, setHandoff] = useState(false);
  const columns: ResearchColumn<Displacement>[] = [
    {
      key: "reference",
      label: zh ? "参照" : "Reference",
      value: (r) => addressLabel(r.reference) + " " + r.reference_letter,
    },
    {
      key: "moving",
      label: zh ? "比较" : "Comparison",
      value: (r) => addressLabel(r.moving) + " " + r.moving_letter,
    },
    {
      key: "displacement",
      label: zh ? "位移（Å）" : "Δ (Å)",
      exportLabel: zh ? "位移（Å）" : "Displacement (Å)",
      numeric: true,
      value: (r) => r.displacement_angstrom,
      render: (r) => (
        <span title={String(r.displacement_angstrom)}>
          {r.displacement_angstrom.toFixed(3)}
        </span>
      ),
    },
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
  ];
  const saved = result.derived_references?.moving;
  if (handoff && saved && onCreated)
    return (
      <ResearchHandoff
        language={language}
        onBack={() => setHandoff(false)}
        capability={"p2rank.detect"}
      >
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
      className="comparison-result-view spatial-results"
      aria-label={
        zh ? "蛋白结构比较结果" : "Protein structure comparison results"
      }
    >
      <StructureWorkbench
        preview={
          <ComparisonPreview
            jobId={job.id}
            language={language}
            headerRef={previewHeader}
            selection={selection}
            hashes={result.artifact_sha256 ?? {}}
            onPick={(side, atom) => {
              const row = matchedResidue(
                data.residue_displacements,
                side,
                atom,
              );
              if (row) setSelection(row);
            }}
            onClear={() => setSelection(null)}
            onUse={saved && onCreated ? () => setHandoff(true) : undefined}
          />
        }
      >
        <SpatialResultSummary
          jobId={job.id}
          language={language}
          title={zh ? "结构对齐摘要" : "Alignment summary"}
          className="comparison-summary"
          hint={
            <Hint
              label={
                zh ? "结构比较的解释" : "Interpreting structural comparisons"
              }
            >
              {result.options.purpose === "conformational_comparison"
                ? zh
                  ? "不同功能状态之间的几何差异不等于预测错误；这些指标不代表亲和力或活性。"
                  : "Geometric differences between functional states do not imply prediction error. These metrics do not measure affinity or activity."
                : zh
                  ? "结果只适用于所选参照、链对应和观测残基；不能代替实验验证。"
                  : "Results are conditioned on the selected reference, mapping and observed residues; they do not replace experimental validation."}
            </Hint>
          }
          metrics={[
            {
              label: zh ? "靶蛋白对齐 RMSD" : "Target-fit RMSD",
              value: (
                <>
                  {data.target_rmsd_angstrom.toFixed(3)} Å
                  <small>
                    {data.matched_target_ca} {zh ? "个匹配 Cα" : "matched Cα"}
                  </small>
                </>
              ),
            },
            {
              label: zh
                ? "靶蛋白对齐后的伙伴 RMSD"
                : "Target-conditioned partner RMSD",
              value: (
                <>
                  {data.partner_rmsd_angstrom.toFixed(3)} Å
                  <small>
                    {data.matched_partner_ca} {zh ? "个匹配 Cα" : "matched Cα"}
                  </small>
                </>
              ),
            },
          ]}
          files={comparisonResultFiles(result, language)}
        />
        {selection && (
          <button
            type="button"
            className="secondary-button comparison-return-to-residue"
            onClick={() => {
              previewHeader.current?.scrollIntoView({
                behavior: "instant",
                block: "start",
              });
              previewHeader.current?.focus({ preventScroll: true });
            }}
          >
            {zh ? "查看选中残基" : "View selected residue"}
          </button>
        )}
        <div className="comparison-analysis">
          <ResearchTabs
            label={zh ? "比较分析" : "Comparison analysis"}
            tabs={[
              {
                id: "plot",
                label: zh ? "位移图" : "Plot",
                content: (
                  <DisplacementPlot
                    rows={data.residue_displacements}
                    language={language}
                    onSelect={setSelection}
                  />
                ),
              },
              {
                id: "residues",
                label: zh ? "残基表" : "Residues",
                content: (
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
                    initialVisibleColumns={[
                      "reference",
                      "moving",
                      "displacement",
                    ]}
                  />
                ),
              },
              {
                id: "interfaces",
                label: zh ? "界面" : "Interfaces",
                content: <InterfaceTable result={result} language={language} />,
              },
              {
                id: "coverage",
                label: zh ? "覆盖率" : "Coverage",
                content: <CoverageTable result={result} language={language} />,
              },
              {
                id: "sources",
                label: zh ? "来源" : "Sources",
                content: (
                  <ComparisonSources
                    jobId={job.id}
                    result={result}
                    language={language}
                  />
                ),
              },
            ]}
          />
        </div>
      </StructureWorkbench>
    </section>
  );
}
