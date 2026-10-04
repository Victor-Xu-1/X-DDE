import { useState } from "react";
import { artifactUrl } from "../api";
import { StateForm } from "./StateForm";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
import { screenReason, type LibraryScreenResult } from "./screen-types";
import { ScaffoldCell, StructuralAlertCell } from "./LibraryInspectionCells";

export function LibraryScreenResults({
  job,
  result,
  language,
  onCreated,
}: {
  job: Job;
  result: LibraryScreenResult;
  language: Language;
  onCreated?(job: Job): void;
}) {
  const zh = language === "zh",
    [selectedOnly, setSelectedOnly] = useState(true),
    [next, setNext] = useState<MoleculeRef | null>(null),
    [page, setPage] = useState(0);
  if (next && onCreated)
    return (
      <section>
        <button type="button" onClick={() => setNext(null)}>
          {zh ? "返回分子库结果" : "Back to library results"}
        </button>
        <StateForm
          language={language}
          onCreated={onCreated}
          initialMolecule={next}
        />
      </section>
    );
  const rows = result.rows.filter((row) => !selectedOnly || row.selected),
    visible = rows.slice(page * 20, (page + 1) * 20),
    alertsRequested = Boolean(
      result.options?.alert_policy && result.options.alert_policy !== "off",
    ),
    inspected = result.rows.filter((row) => row.structural_alerts != null),
    flagged = inspected.filter((row) => row.structural_alerts!.length > 0),
    grouped = result.scaffold_groups != null;
  return (
    <div className="discovery-results">
      <p>
        {zh ? "选中" : "Selected"} {result.selected_records.length} /{" "}
        {result.rows.length} ·{" "}
        {zh ? "按化学结构条件，不代表药效" : "Chemical criteria, not activity"}
      </p>
      {alertsRequested && (
        <p role="status">
          {zh
            ? `完成风险检查 ${inspected.length} / ${result.rows.length}，${flagged.length} 个分子需核查；规则提示不代表毒性或药效。`
            : `Structural rules evaluated for ${inspected.length} / ${result.rows.length}; ${flagged.length} molecules need review. Rule alerts do not establish toxicity or activity.`}
        </p>
      )}
      {grouped && (
        <p>
          {zh
            ? `共 ${result.scaffold_groups!.length} 个结构组；组内按原始顺序选择，不是药效排名。`
            : `${result.scaffold_groups!.length} chemical families; representatives follow input order, not activity rank.`}
        </p>
      )}
      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={selectedOnly}
          onChange={(e) => {
            setSelectedOnly(e.target.checked);
            setPage(0);
          }}
        />
        {zh ? "只看选中分子" : "Show selected molecules only"}
      </label>
      {result.selected_records.length > 0 && (
        <a href={artifactUrl(job.id, result.artifact)} download>
          {zh ? "下载选中分子 SDF" : "Download selected SDF"}
        </a>
      )}
      {result.report_artifact && (
        <a href={artifactUrl(job.id, result.report_artifact)} download>
          {zh ? "下载筛选表格" : "Download selection report"}
        </a>
      )}
      {!visible.length && (
        <p role="status">
          {zh
            ? "此范围没有选中分子，可返回调整条件。"
            : "No molecules selected in this range; revise the criteria."}
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                zh ? "原始编号" : "Input record",
                "SMILES",
                zh ? "分子量" : "MW",
                "LogP",
                ...(alertsRequested
                  ? [zh ? "结构风险" : "Structural alerts"]
                  : []),
                ...(grouped ? [zh ? "骨架组" : "Scaffold family"] : []),
                zh ? "选择依据" : "Selection evidence",
                zh ? "下一步" : "Next",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.record}>
                <td>{row.record + 1}</td>
                <td className="result-value">
                  {row.descriptors?.smiles ?? "—"}
                  {row.descriptors && row.descriptors.fragments > 1 && (
                    <small>{zh ? "包含多片段" : "Multiple fragments"}</small>
                  )}
                </td>
                <td>{row.descriptors?.mw.toFixed(1) ?? "—"}</td>
                <td>{row.descriptors?.logp.toFixed(2) ?? "—"}</td>
                {alertsRequested && (
                  <td>
                    <StructuralAlertCell row={row} language={language} />
                  </td>
                )}
                {grouped && (
                  <td>
                    <ScaffoldCell
                      row={row}
                      groups={result.scaffold_groups}
                      language={language}
                    />
                  </td>
                )}
                <td>
                  {row.similarity != null ? (
                    row.similarity.toFixed(3)
                  ) : row.substructure_match != null ? (
                    row.substructure_match ? (
                      zh ? (
                        "匹配片段"
                      ) : (
                        "Substructure match"
                      )
                    ) : zh ? (
                      "不匹配"
                    ) : (
                      "No match"
                    )
                  ) : row.selected ? (
                    zh ? (
                      "已选中"
                    ) : (
                      "Selected"
                    )
                  ) : (
                    <span title={row.reason ?? undefined}>
                      {screenReason(row, zh)}
                    </span>
                  )}
                </td>
                <td>
                  {row.reference && onCreated && (
                    <button
                      type="button"
                      onClick={() => setNext(row.reference!)}
                    >
                      {zh ? "准备分子" : "Prepare molecule"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 20 && (
        <div>
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((v) => v - 1)}
          >
            {zh ? "上一页" : "Previous"}
          </button>
          <span>
            {page + 1} / {Math.ceil(rows.length / 20)}
          </span>
          <button
            type="button"
            disabled={(page + 1) * 20 >= rows.length}
            onClick={() => setPage((v) => v + 1)}
          >
            {zh ? "下一页" : "Next page"}
          </button>
        </div>
      )}
    </div>
  );
}
