import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { useMemo, useState } from "react";
import {
  ResearchTable,
  type ResearchColumn,
} from "../presentation/ResearchTable";
import { AssemblyQualityView, assemblyClashes } from "./Quality";
import {
  mechanismLabels,
  type AssemblyProposal,
  type TernaryResult,
} from "./types";
import type { Job, Language } from "../types";
import { ResultsPreview } from "./ResultsPreview";
import { AssemblyComparison } from "./AssemblyComparison";
import { AttachmentDirections } from "./AttachmentDirections";
import { useAssemblyComparison } from "./useAssemblyComparison";
import "../presentation/spatial-result-review.css";
import "./proximity.css";

function assemblyLabel(id: string, zh: boolean, selected = false) {
  const label = zh
    ? selected
      ? "当前装配"
      : "装配"
    : selected
      ? "Selected assembly"
      : "Assembly";
  return label + " " + Number(id.split("-")[1]);
}

type ProximityResultProps = {
  job: Job;
  result: TernaryResult;
  hashes?: Readonly<Record<string, string>>;
  language: Language;
};

export function ProximityResults(props: ProximityResultProps) {
  return <ProximityResultWorkspace key={props.job.id} {...props} />;
}

function ProximityResultWorkspace({
  job,
  result,
  hashes,
  language,
}: ProximityResultProps) {
  const zh = language === "zh",
    rows = result.assemblies;
  const [selected, setSelected] = useState(
    rows.find((r) => r.quality.accepted)?.id ?? rows[0]?.id ?? "",
  );
  const active = rows.find((r) => r.id === selected) ?? rows[0];
  const [view, setView] = useState("assembly");
  const [bond, setBond] = useState<string | null>();
  const comparison = useAssemblyComparison(rows);
  const { pair } = comparison;
  const attachments =
    result.attachment_geometry?.assemblies.find((row) => row.id === active?.id)
      ?.bonds ?? [];
  const activeView =
    view === "attachments" && !attachments.length ? "assembly" : view;
  const showAttachments = !pair && activeView === "attachments";
  const selectedBond =
    bond === undefined && attachments.length > 2
      ? attachments[0].id
      : (bond ?? null);
  const qualified = rows.filter((r) => r.quality.accepted).length;
  function inspect(id: string) {
    comparison.close("preview");
    if (id !== active?.id) {
      setSelected(id);
      setBond(undefined);
    }
  }
  const columns = useMemo<ResearchColumn<AssemblyProposal>[]>(
    () => [
      {
        key: "id",
        label: zh ? "装配" : "Assembly",
        value: (r) => r.id,
        render: (r) => <strong>{assemblyLabel(r.id, zh)}</strong>,
      },
      {
        key: "geometry",
        label: zh ? "几何检查" : "Geometry",
        exportLabel: zh ? "基本几何检查" : "Basic geometry assessment",
        value: (r) =>
          r.quality.accepted
            ? zh
              ? "通过"
              : "Passed"
            : zh
              ? "需检查"
              : "Review",
        render: (r) => (
          <span
            className={
              r.quality.accepted
                ? "proximity-check-pass"
                : "proximity-check-fail"
            }
          >
            {r.quality.accepted
              ? zh
                ? "通过"
                : "Passed"
              : zh
                ? "需检查"
                : "Review"}
          </span>
        ),
      },
      {
        key: "contactsA",
        label: zh ? "端 1 接触" : "Contacts 1",
        exportLabel: "Partner 1 contacting heavy atoms",
        value: (r) => r.quality.arms[0].contacting_heavy_atoms,
        numeric: true,
      },
      {
        key: "contactsB",
        label: zh ? "端 2 接触" : "Contacts 2",
        exportLabel: "Partner 2 contacting heavy atoms",
        value: (r) => r.quality.arms[1].contacting_heavy_atoms,
        numeric: true,
      },
      {
        key: "clashes",
        label: zh ? "严重碰撞" : "Clashes",
        exportLabel: "Severe atom clashes",
        value: assemblyClashes,
        numeric: true,
      },
    ],
    [zh],
  );
  const overview = (
    <section className="proximity-result-overview">
      <div className="proximity-result-heading">
        <h2>{zh ? "三元装配" : "Ternary assemblies"}</h2>
        <span className="proximity-caption">
          {mechanismLabels[result.mechanism][zh ? 0 : 1]}
        </span>
      </div>
      <dl className="proximity-summary">
        <div>
          <dt>{zh ? "生成装配" : "Generated"}</dt>
          <dd>
            {rows.length}
            <span className="proximity-request-count">
              {" "}
              / {result.search.requested}
            </span>
          </dd>
        </div>
        <div>
          <dt>{zh ? "基本几何通过" : "Basic geometry passed"}</dt>
          <dd>{qualified}</dd>
        </div>
      </dl>
      {result.search.returned < result.search.requested && (
        <p role="status" className="notice">
          {zh
            ? "已到达探索预算，以下展示实际返回的装配。"
            : "The exploration budget was reached. Actual returned assemblies are shown below."}
        </p>
      )}
    </section>
  );
  return (
    <div className="proximity-results" lang={language}>
      {!active ? (
        <>
          {overview}
          <p role="status">
            {zh
              ? "当前预算内没有生成装配。请检查结合姿势与材料后重新设置探索方案。"
              : "No assembly was generated within this budget. Review the bound poses and materials before another exploration."}
          </p>
        </>
      ) : (
        <StructureWorkbench
          preview={
            <div
              ref={comparison.preview}
              tabIndex={-1}
              role="group"
              aria-label={zh ? "装配结构预览" : "Assembly structure preview"}
            >
              {pair ? (
                <AssemblyComparison
                  key={JSON.stringify(pair.map((row) => row.id))}
                  jobId={job.id}
                  assemblies={pair}
                  hashes={hashes}
                  labels={[
                    assemblyLabel(pair[0].id, zh),
                    assemblyLabel(pair[1].id, zh),
                  ]}
                  language={language}
                  activation={comparison.activation}
                  onBack={() => comparison.close("table")}
                  onInspect={inspect}
                />
              ) : (
                <ResultsPreview
                  job={job}
                  result={result}
                  assembly={active}
                  label={assemblyLabel(active.id, zh, true)}
                  language={language}
                  view={activeView}
                  onView={setView}
                  attachments={attachments}
                  selectedBond={selectedBond}
                />
              )}
            </div>
          }
        >
          {showAttachments ? (
            <AttachmentDirections
              rows={attachments}
              selected={selectedBond}
              onSelect={setBond}
              language={language}
            />
          ) : (
            overview
          )}
          <div className="proximity-comparison" ref={comparison.details}>
            <ResearchTable
              rows={rows}
              columns={columns}
              rowId={(r) => r.id}
              language={language}
              title={zh ? "装配比较" : "Compare assemblies"}
              compactToolbar
              selected={pair ? null : active.id}
              initialVisibleColumns={["id", "geometry", "clashes"]}
              onSelect={(r) => inspect(r.id)}
              comparisonActions={(marked) => (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={marked.length !== 2}
                  title={
                    zh
                      ? "勾选两个装配以并列查看。"
                      : "Mark two assemblies to view them side by side."
                  }
                  onClick={(event) =>
                    comparison.open(marked, event.currentTarget)
                  }
                >
                  {zh ? "三维比较两个装配" : "Compare two assemblies in 3D"}
                </button>
              )}
              exportName="ternary-assemblies.csv"
            />
            {!pair && activeView !== "attachments" && (
              <AssemblyQualityView
                assembly={active}
                mechanism={result.mechanism}
                language={language}
              />
            )}
          </div>
        </StructureWorkbench>
      )}
    </div>
  );
}
