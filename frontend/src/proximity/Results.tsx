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
import { AttachmentDirections } from "./AttachmentDirections";
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

export function ProximityResults({
  job,
  result,
  language,
}: {
  job: Job;
  result: TernaryResult;
  language: Language;
}) {
  const zh = language === "zh",
    rows = result.assemblies;
  const [selected, setSelected] = useState(
    rows.find((r) => r.quality.accepted)?.id ?? rows[0]?.id ?? "",
  );
  const active = rows.find((r) => r.id === selected) ?? rows[0];
  const [view, setView] = useState("assembly");
  const [bond, setBond] = useState<string | null>();
  const attachments =
    result.attachment_geometry?.assemblies.find((row) => row.id === active?.id)
      ?.bonds ?? [];
  const activeView =
    view === "attachments" && !attachments.length ? "assembly" : view;
  const selectedBond =
    bond === undefined && attachments.length > 2
      ? attachments[0].id
      : (bond ?? null);
  const qualified = rows.filter((r) => r.quality.accepted).length;
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
        <h2>
          {mechanismLabels[result.mechanism][zh ? 0 : 1]} ·{" "}
          {zh ? "三元装配" : "Ternary assemblies"}
        </h2>
        <span className="proximity-caption">
          {zh ? "结构假设" : "Structural hypotheses"}
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
          }
        >
          {activeView === "attachments" ? (
            <AttachmentDirections
              rows={attachments}
              selected={selectedBond}
              onSelect={setBond}
              language={language}
            />
          ) : (
            overview
          )}
          <div className="proximity-comparison">
            <ResearchTable
              rows={rows}
              columns={columns}
              rowId={(r) => r.id}
              language={language}
              title={zh ? "装配比较" : "Compare assemblies"}
              selected={active.id}
              initialVisibleColumns={["id", "geometry", "clashes"]}
              onSelect={(r) => {
                if (r.id === active.id) return;
                setSelected(r.id);
                setBond(undefined);
              }}
              exportName="ternary-assemblies.csv"
            />
            {activeView !== "attachments" && (
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
