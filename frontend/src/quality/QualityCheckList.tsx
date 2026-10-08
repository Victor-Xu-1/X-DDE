import { useState } from "react";
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
} from "@ant-design/icons";
import type { Language } from "../types";
import { checkLabels } from "./labels";
import type { PoseQualityResult } from "./types";

type Outcome = PoseQualityResult["checks"][number]["outcome"];
export function QualityCheckList({
  checks,
  language,
}: {
  checks: PoseQualityResult["checks"];
  language: Language;
}) {
  const zh = language === "zh",
    [filter, setFilter] = useState<Outcome | "all">("all");
  const labels = {
    all: zh ? "全部项目" : "All checks",
    pass: zh ? "通过" : "Pass",
    fail: zh ? "需要复核" : "Needs review",
    unavailable: zh ? "未能计算" : "Not calculated",
  };
  const counts = { pass: 0, fail: 0, unavailable: 0 };
  checks.forEach((row) => counts[row.outcome]++);
  const visible = checks.filter(
    (row) => filter === "all" || row.outcome === filter,
  );
  const icons = {
    pass: <CheckCircleOutlined aria-hidden="true" />,
    fail: <ExclamationCircleOutlined aria-hidden="true" />,
    unavailable: <MinusCircleOutlined aria-hidden="true" />,
  };
  return (
    <div className="result-inspection-list quality-checks">
      <div className="result-inspection-heading">
        <h3>{zh ? "质控项目" : "Quality checks"}</h3>
        <span className="result-inspection-count">{checks.length}</span>
      </div>
      <label className="field">
        {zh ? "显示哪些检查？" : "Which checks?"}
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as Outcome | "all")}
        >
          {(["all", "fail", "unavailable", "pass"] as const).map((value) => (
            <option key={value} value={value}>
              {labels[value]} ·{" "}
              {value === "all" ? checks.length : counts[value]}
            </option>
          ))}
        </select>
      </label>
      <div className="table-scroll quality-check-scroll">
        <table aria-label={zh ? "质控检查结果" : "Quality check outcomes"}>
          <thead>
            <tr>
              <th>{zh ? "检查项目" : "Check"}</th>
              <th>{zh ? "结果" : "Outcome"}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td>{checkLabels[row.id]?.[zh ? 0 : 1] ?? row.id}</td>
                <td>
                  <span className={"quality-outcome is-" + row.outcome}>
                    {icons[row.outcome]}
                    {labels[row.outcome]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && (
        <p role="status">
          {checks.length
            ? zh
              ? "此类别没有检查项目。"
              : "There are no checks in this category."
            : zh
              ? "本次结果没有可查看的检查项目。"
              : "This result contains no quality checks."}
        </p>
      )}
    </div>
  );
}
