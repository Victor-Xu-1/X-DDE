import { useLayoutEffect, useRef } from "react";
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
} from "@ant-design/icons";
import type { Language } from "../types";
import { assessmentLabels, assessmentReasons, checkLabels } from "./labels";
import {
  filterQualityChecks,
  type AssessedCheck,
  type QualityFilter,
} from "./assessment";

export function QualityCheckList({
  checks,
  filter,
  language,
}: {
  checks: readonly AssessedCheck[];
  filter: QualityFilter;
  language: Language;
}) {
  const zh = language === "zh";
  const scroll = useRef<HTMLDivElement>(null);
  const visible = filterQualityChecks(checks, filter);
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [filter]);
  const icons = {
    pass: <CheckCircleOutlined aria-hidden="true" />,
    fail: <ExclamationCircleOutlined aria-hidden="true" />,
    unavailable: <MinusCircleOutlined aria-hidden="true" />,
    unassessed: <ExclamationCircleOutlined aria-hidden="true" />,
    not_applicable: <MinusCircleOutlined aria-hidden="true" />,
  };
  return (
    <div className="result-inspection-list quality-checks">
      <div className="result-inspection-heading">
        <h3>{zh ? "质控项目" : "Quality checks"}</h3>
        <span className="result-inspection-count">
          {filter === "all"
            ? checks.length
            : visible.length + " / " + checks.length}
        </span>
      </div>
      <div className="table-scroll quality-check-scroll" ref={scroll}>
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
                  <span className={"quality-outcome is-" + row.assessment}>
                    {icons[row.assessment]}
                    {assessmentLabels[row.assessment][zh ? 0 : 1]}
                  </span>
                  {row.reason && (
                    <small className="quality-check-note">
                      {assessmentReasons[row.reason][zh ? 0 : 1]}
                    </small>
                  )}
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
