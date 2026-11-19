import { useState } from "react";
import { artifactUrl } from "../api";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import type { Job, Language } from "../types";
import {
  screenReason,
  type LibraryScreenResult,
  type ScreenRow,
} from "./screen-types";
import { LibraryScreenSelection } from "./LibraryScreenSelection";
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
  const handoff = onCreated && preparation.input;
  const alertsRequested = Boolean(
    result.options?.alert_policy && result.options.alert_policy !== "off",
  );
  const inspected = result.rows.filter((row) => row.structural_alerts != null);
  const flagged = inspected.filter((row) => row.structural_alerts!.length > 0);
  const grouped = result.scaffold_groups != null;
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
                onChange={(event) => {
                  setSelectedOnly(event.target.checked);
                  setPage(0);
                }}
              />
              {zh ? "只看选中分子" : "Show selected molecules only"}
            </label>
            {alertsRequested && (
              <p role="status">
                {zh
                  ? `已检查 ${inspected.length} / ${result.rows.length} 个分子，${flagged.length} 个需核查。`
                  : `Structural rules evaluated for ${inspected.length} / ${result.rows.length} molecules. Review ${flagged.length} flagged.`}
              </p>
            )}
            {grouped && (
              <p className="field-help">
                {zh
                  ? `共 ${result.scaffold_groups!.length} 个结构组；组内按原始顺序选择，不是药效排名。`
                  : `${result.scaffold_groups!.length} chemical families; representatives follow input order, not activity rank.`}
              </p>
            )}
            {!active ? (
              <p role="status">
                {zh
                  ? "此范围没有选中分子，可返回调整条件。"
                  : "No molecules selected in this range; revise the criteria."}
              </p>
            ) : (
              <div className="table-scroll library-screen-records">
                <table aria-label={zh ? "筛选条目" : "Screening records"}>
                  <thead>
                    <tr>
                      <th scope="col">{zh ? "原始编号" : "Input record"}</th>
                      <th scope="col">{zh ? "分子量" : "MW"}</th>
                      <th scope="col">LogP</th>
                      <th scope="col">
                        {zh ? "选择依据" : "Selection evidence"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <tr
                        key={row.record}
                        data-selected={
                          active.record === row.record || undefined
                        }
                      >
                        <th scope="row">
                          <button
                            className="text-button library-screen-record"
                            type="button"
                            aria-label={`${zh ? "原始分子" : "Input molecule"} #${row.record + 1}`}
                            aria-pressed={active.record === row.record}
                            onClick={() => setRecord(row.record)}
                          >
                            #{row.record + 1}
                          </button>
                        </th>
                        <td>{row.descriptors?.mw.toFixed(1) ?? "—"}</td>
                        <td>{row.descriptors?.logp.toFixed(2) ?? "—"}</td>
                        <td>
                          <span title={row.reason ?? undefined}>
                            {selectionEvidence(row, zh)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

function selectionEvidence(row: ScreenRow, zh: boolean) {
  if (row.similarity != null) return row.similarity.toFixed(3);
  if (row.substructure_match != null)
    return row.substructure_match
      ? zh
        ? "匹配片段"
        : "Substructure match"
      : zh
        ? "不匹配"
        : "No match";
  if (row.selected) return zh ? "已选中" : "Selected";
  return screenReason(row, zh);
}
