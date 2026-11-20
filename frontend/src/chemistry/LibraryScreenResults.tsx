import { useState } from "react";
import { artifactUrl } from "../api";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { CandidateReviewBar } from "../presentation/CandidateReviewBar";
import type { Job, Language } from "../types";
import { screenReason, type LibraryScreenResult } from "./screen-types";
import { LibraryScreenSelection } from "./LibraryScreenSelection";
import { LibraryScreenRecords } from "./LibraryScreenRecords";
import {
  StatePreparationHandoff,
  useStatePreparation,
} from "./StatePreparationHandoff";
import "./library-screen-results.css";

type Props = {
  job: Job;
  result: LibraryScreenResult;
  language: Language;
  onCreated?(job: Job): void;
};

const PAGE_SIZE = 20;

export function LibraryScreenResults(props: Props) {
  return <LibraryScreenWorkspace key={props.job.id} {...props} />;
}

function LibraryScreenWorkspace({ job, result, language, onCreated }: Props) {
  const zh = language === "zh";
  const [selectedOnly, setSelectedOnly] = useState(true);
  const [page, setPage] = useState(0);
  const [record, setRecord] = useState<number | null>(null);
  const preparation = useStatePreparation();
  const rows = result.rows.filter((row) => !selectedOnly || row.selected);
  const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const active = visible.find((row) => row.record === record) ?? visible[0];
  const position = rows.indexOf(active);
  const nearby = rows.slice(Math.max(0, position - 2), position + 3);
  const activeReason = active ? screenReason(active, zh) : null;
  function select(id: number) {
    const index = rows.findIndex((row) => row.record === id);
    if (index < 0) return;
    setRecord(id);
    setPage(Math.floor(index / PAGE_SIZE));
  }
  function filter(onlySelected: boolean) {
    const next = result.rows.filter((row) => !onlySelected || row.selected);
    const index = next.findIndex((row) => row.record === active?.record);
    setSelectedOnly(onlySelected);
    setRecord(index >= 0 ? next[index].record : null);
    setPage(Math.floor(Math.max(0, index) / PAGE_SIZE));
  }
  const handoff = onCreated && preparation.input;
  const alertsRequested = Boolean(
    result.options?.alert_policy && result.options.alert_policy !== "off",
  );
  const inspected = result.rows.filter((row) => row.structural_alerts != null);
  const flagged = inspected.filter((row) => row.structural_alerts!.length > 0);
  const groupCount = result.scaffold_groups?.length;
  const coverage =
    inspected.length < result.rows.length
      ? zh
        ? `已检查 ${inspected.length}/${result.rows.length}`
        : `${inspected.length}/${result.rows.length} checked`
      : null;
  const evidenceSummary = [
    alertsRequested ? coverage : null,
    alertsRequested
      ? zh
        ? `${flagged.length} 个需核查`
        : `${flagged.length} flagged`
      : null,
    groupCount === undefined
      ? null
      : zh
        ? `${groupCount} 个结构组`
        : `${groupCount} chemical families`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section
      className="library-screen-results"
      aria-label={zh ? "分子库结果" : "Library results"}
    >
      <div className="preparation-origin" hidden={Boolean(handoff)}>
        <header className="library-screen-results-heading">
          <div>
            <h3>{zh ? "分子库筛选" : "Library selection"}</h3>
            <span>
              {zh ? "选中" : "Selected"} {result.selected_records.length} /{" "}
              {result.rows.length}
            </span>
          </div>
          <div className="library-screen-downloads">
            {result.selected_records.length > 0 && (
              <a
                className="secondary-button"
                href={artifactUrl(job.id, result.artifact)}
                download
              >
                {zh ? "下载选中分子 SDF" : "Download selected SDF"}
              </a>
            )}
            {result.report_artifact && (
              <a
                className="secondary-button"
                href={artifactUrl(job.id, result.report_artifact)}
                download
              >
                {zh ? "下载筛选表格" : "Download selection report"}
              </a>
            )}
          </div>
        </header>
        <StructureWorkbench
          preview={
            active && (
              <LibraryScreenSelection
                row={active}
                result={result}
                language={language}
                onPrepare={onCreated && preparation.open}
              />
            )
          }
        >
          <div className="library-screen-candidates">
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={selectedOnly}
                onChange={(event) => filter(event.target.checked)}
              />
              {zh ? "只看选中分子" : "Show selected molecules only"}
            </label>
            {evidenceSummary && (
              <details className="library-screen-evidence">
                <summary>{evidenceSummary}</summary>
                {alertsRequested && (
                  <p>
                    {zh
                      ? `结构规则已检查 ${inspected.length} / ${result.rows.length} 个分子。`
                      : `Structural rules evaluated for ${inspected.length} / ${result.rows.length} molecules.`}
                  </p>
                )}
                {groupCount !== undefined && (
                  <p>
                    {zh
                      ? "组内代表按输入顺序选择。药效排序需依据独立的活性数据。"
                      : "Representatives follow input order. Activity ranking requires separate activity data."}
                  </p>
                )}
              </details>
            )}
            {!active ? (
              <p role="status">
                {zh
                  ? "此范围没有选中分子，可返回调整条件。"
                  : "No molecules selected in this range; revise the criteria."}
              </p>
            ) : (
              <>
                {rows.length > 1 && (
                  <CandidateReviewBar
                    label={
                      zh ? "筛选分子导航" : "Screening molecule navigation"
                    }
                    caption={`${position + 1} / ${rows.length}`}
                    language={language}
                    selected={active.record}
                    candidates={nearby.map(({ record }) => ({
                      id: record,
                      short: record + 1,
                      label: `${zh ? "预览原始分子" : "Preview input molecule"} #${record + 1}`,
                    }))}
                    onSelect={select}
                  />
                )}
                <LibraryScreenRecords
                  rows={visible}
                  selected={active.record}
                  language={language}
                  onSelect={select}
                />
              </>
            )}
            {rows.length > PAGE_SIZE && (
              <nav
                className="library-screen-pages"
                aria-label={zh ? "条目分页" : "Record pages"}
              >
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  {zh ? "上一页" : "Previous"}
                </button>
                <span>
                  {page + 1} / {Math.ceil(rows.length / PAGE_SIZE)}
                </span>
                <button
                  type="button"
                  disabled={(page + 1) * PAGE_SIZE >= rows.length}
                  onClick={() => setPage(page + 1)}
                >
                  {zh ? "下一页" : "Next"}
                </button>
              </nav>
            )}
            {activeReason && (
              <p className="field-help library-screen-selected-reason">
                {activeReason}
              </p>
            )}
          </div>
        </StructureWorkbench>
      </div>
      {handoff && onCreated && (
        <StatePreparationHandoff
          input={handoff}
          language={language}
          backLabel={zh ? "返回分子库结果" : "Back to library results"}
          onBack={preparation.close}
          onCreated={onCreated}
        />
      )}
    </section>
  );
}
