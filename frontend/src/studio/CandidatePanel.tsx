import { componentsOf } from "../operations/types";
import { useId, useMemo, useState } from "react";
import { DownloadOutlined } from "@ant-design/icons";
import { artifactUrl } from "../api";
import { MetricHelp } from "../guided/MetricHelp";
import type { Analysis, Job, Language } from "../types";
const n = (v: number | null | undefined, d = 2) =>
  v == null ? "—" : v.toFixed(d);
export const conformerName = (id: string, zh: boolean) => {
  const multi = /^seed-(\d+)-sample-(\d+)$/.exec(id);
  if (multi)
    return `${zh ? "种子" : "Seed"} ${multi[1]} · ${zh ? "构象" : "Conformer"} ${Number(multi[2]) + 1}`;
  return (
    (zh ? "构象 " : "Conformer ") +
    (Number(id.split("-")[1]) + 1) +
    (id.split("-")[2] ? " · " + id.split("-")[2].slice(0, 6) : "")
  );
};
interface Props {
  job: Job | null;
  analysis: Analysis | null;
  loading: boolean;
  error: string;
  language: Language;
  selected: string | null;
  onSelect(id: string): void;
  compared?: string[];
  onCompare?(ids: string[]): void;
  onRetry?(): void;
}
export function CandidatePanel({
  job,
  analysis,
  loading,
  error,
  language,
  selected,
  onSelect,
  compared = [],
  onCompare,
  onRetry,
}: Props) {
  const zh = language === "zh",
    [filter, setFilter] = useState("all");
  const filterId = useId();
  const all = analysis?.candidates ?? [],
    polymer = componentsOf(job?.request).some((x) =>
      ["protein", "dna", "rna"].includes(x.kind),
    ),
    multiple =
      (componentsOf(job?.request).reduce((a, x) => a + x.count, 0) ?? 0) > 1;
  const candidates = useMemo(() => {
    let rows = [...all].sort(
      (a, b) => (b.ranking_score ?? -Infinity) - (a.ranking_score ?? -Infinity),
    );
    if (filter === "top") rows = rows.slice(0, 3);
    if (filter === "unclashed")
      rows = rows.filter((x) => x.has_clash === false);
    return rows;
  }, [all, filter]);
  return (
    <section className="studio-panel candidate-panel">
      <div className="studio-heading">
        <h3>
          {zh ? "预测构象" : "Predicted conformers"}{" "}
          <small>({all.length})</small>
        </h3>
        {all.length > 0 && (
          <div className="candidate-actions">
            <label className="sr-only" htmlFor={filterId}>
              {zh ? "构象筛选" : "Conformer filter"}
            </label>
            <select
              id={filterId}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">{zh ? "全部构象" : "All conformers"}</option>
              <option value="top">{zh ? "排名前 3" : "Top 3"}</option>
              <option value="unclashed">
                {zh ? "无严重原子碰撞" : "No severe clashes"}
              </option>
            </select>
            {job && (
              <a
                className="export-button"
                href={"/api/jobs/" + job.id + "/candidates.csv"}
                download
              >
                <DownloadOutlined /> {zh ? "导出表格" : "Export table"}
              </a>
            )}
          </div>
        )}
      </div>
      <p className="candidate-guidance">
        {zh
          ? "点击构象看结构；分数用于同一任务内比较，不是药效。"
          : "Select a conformer to view it. Scores compare this task's structures, not potency."}
      </p>
      {all.length > 1 && onCompare && (
        <p className="comparison-note">
          {zh
            ? "勾选 2–3 个构象可自动叠加比较。"
            : "Check 2–3 conformers to overlay them."}{" "}
          {compared.length > 0 && (
            <button onClick={() => onCompare([])}>
              {zh ? "退出叠加" : "Clear overlay"}
            </button>
          )}
        </p>
      )}
      <div className="candidate-scroll">
        <table>
          <thead>
            <tr>
              <th>{zh ? "构象" : "Conformer"}</th>
              <th>
                {zh ? "排序分数" : "Ranking"}
                <MetricHelp metric="ranking" language={language} />
              </th>
              {polymer && (
                <th>
                  pLDDT
                  <MetricHelp metric="plddt" language={language} />
                </th>
              )}
              {multiple && (
                <th>
                  ipTM
                  <MetricHelp metric="iptm" language={language} />
                </th>
              )}
              {all.length > 1 && (
                <th>
                  RMSD
                  <MetricHelp metric="rmsd" language={language} />
                </th>
              )}
              <th>{zh ? "操作" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((row) => (
              <tr key={row.id} className={row.id === selected ? "active" : ""}>
                <td>
                  <button
                    className="conformer-select"
                    aria-pressed={row.id === selected}
                    onClick={() => onSelect(row.id)}
                  >
                    {conformerName(row.id, zh)}
                  </button>
                  <small>
                    {row.atom_count} {zh ? "原子" : "atoms"}
                  </small>
                </td>
                <td className="score">{n(row.ranking_score, 3)}</td>
                {polymer && <td>{n(row.plddt)}</td>}
                {multiple && <td>{n(row.iptm)}</td>}
                {all.length > 1 && <td>{n(row.rmsd_to_first)} Å</td>}
                <td>
                  <div className="candidate-row-actions">
                    {all.length > 1 && onCompare && (
                      <input
                        type="checkbox"
                        aria-label={
                          (zh ? "叠加 " : "Overlay ") +
                          conformerName(row.id, zh)
                        }
                        checked={compared.includes(row.id)}
                        disabled={
                          row.rmsd_to_first === null ||
                          (!compared.includes(row.id) && compared.length >= 3)
                        }
                        onChange={(e) =>
                          onCompare(
                            e.target.checked
                              ? [...compared, row.id]
                              : compared.filter((x) => x !== row.id),
                          )
                        }
                      />
                    )}{" "}
                    {job && (
                      <a
                        aria-label={
                          (zh ? "下载 " : "Download ") +
                          conformerName(row.id, zh)
                        }
                        title={
                          zh
                            ? "下载三维结构（CIF）"
                            : "Download 3D structure (CIF)"
                        }
                        href={artifactUrl(job.id, row.artifact)}
                        download
                      >
                        <DownloadOutlined />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && (
        <p className="candidate-state" role="status">
          {zh
            ? "正在整理结构与分子性质…"
            : "Preparing structures and molecular properties…"}
        </p>
      )}
      {error && (
        <p className="candidate-state error-box" role="alert">
          {zh
            ? "结果分析暂未完成。原始结构可从任务中心下载。"
            : "Analysis could not complete. Download original structures from Task center."}{" "}
          {error}{" "}
          {onRetry && (
            <button onClick={onRetry}>
              {zh ? "重新读取结果" : "Retry analysis"}
            </button>
          )}
        </p>
      )}
      {!loading && !error && !candidates.length && (
        <p className="candidate-state">
          {all.length
            ? zh
              ? "没有满足此条件的构象。请选择“全部构象”。"
              : "No matching conformers. Choose All conformers."
            : zh
              ? "完成一次预测后，结果会自动出现在这里。"
              : "Results appear here after a prediction finishes."}
        </p>
      )}
      <div className="candidate-foot">
        <span>
          {zh ? "来源：OpenDDE 实际输出" : "Source: actual OpenDDE output"}
        </span>
        {compared.length > 1 && (
          <span>
            {zh ? "正在叠加" : "Overlaying"} {compared.length}
          </span>
        )}
      </div>
    </section>
  );
}
