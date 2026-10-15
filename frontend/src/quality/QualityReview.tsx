import type { ReactNode } from "react";
import { ReviewReference } from "../diffsbdd/ReviewReference";
import type { Language } from "../types";
import type { PoseQualityTask } from "./types";

export function QualityReview({
  getTask,
  enabled,
  language,
}: {
  getTask(): PoseQualityTask;
  enabled: boolean;
  language: Language;
}) {
  if (!enabled) return null;
  const request = getTask();
  const zh = language === "zh";
  const purposes = zh
    ? {
        mol: "分子三维构象",
        dock: "蛋白内的结合姿势",
        redock: "与同一分子的实验姿势比较",
      }
    : {
        mol: "Molecular conformation",
        dock: "Pose within a protein",
        redock: "Compare with an experimental pose of the same molecule",
      };
  const rows: [string, ReactNode][] = [
    [zh ? "任务" : "Task", request.name],
    [zh ? "检查用途" : "Check", purposes[request.options.profile]],
    [
      zh ? "研究分子" : "Study molecule",
      <ReviewReference
        reference={request.molecule}
        kind="ligand"
        language={language}
      />,
    ],
  ];
  if (request.protein) {
    rows.push(
      [
        zh ? "对应受体" : "Matching receptor",
        <ReviewReference
          reference={request.protein}
          kind="structure"
          language={language}
        />,
      ],
      [
        zh ? "坐标系" : "Coordinate frame",
        request.coordinate_basis === "user_confirmed"
          ? zh
            ? "已确认与所选受体一致"
            : "Confirmed to match the selected receptor"
          : zh
            ? "尚未确认"
            : "Not confirmed",
      ],
    );
  }
  if (request.reference) {
    rows.push([
      zh ? "实验参考姿势" : "Experimental reference pose",
      <ReviewReference
        reference={request.reference}
        kind="ligand"
        language={language}
      />,
    ]);
  }
  return (
    <>
      <table
        className="compact-table"
        aria-label={zh ? "质检材料与方案" : "Quality materials and plan"}
      >
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {zh
          ? "质检保留原始坐标，不移动或修补分子。"
          : "Checking preserves the original coordinates; it does not move or repair molecules."}
      </p>
      <details>
        <summary>{zh ? "方法与计算预算" : "Method and compute budget"}</summary>
        <dl className="questionnaire-review">
          <dt>{zh ? "方法" : "Method"}</dt>
          <dd>PoseBusters 0.6.5</dd>
          <dt>CPU</dt>
          <dd>{request.options.cpu}</dd>
          <dt>{zh ? "内存上限" : "Memory limit"}</dt>
          <dd>{request.options.memory_mib} MiB</dd>
        </dl>
      </details>
    </>
  );
}
