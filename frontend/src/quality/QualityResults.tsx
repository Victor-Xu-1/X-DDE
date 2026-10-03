import { artifactUrl } from "../api";
import { Hint } from "../guided/Hint";
import type { Job, Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import { checkLabels } from "./labels";
import type { PoseQualityResult } from "./types";

export function QualityResults({
  job,
  result,
  language,
}: {
  job: Job;
  result: PoseQualityResult;
  language: Language;
}) {
  const zh = language === "zh",
    counts = { pass: 0, fail: 0, unavailable: 0 };
  result.checks.forEach((row) => counts[row.outcome]++);
  const outcome = {
    pass: zh ? "通过" : "Pass",
    fail: zh ? "需要复核" : "Needs review",
    unavailable: zh ? "未能计算" : "Not calculated",
  };
  return (
    <section
      className="discovery-results"
      aria-label={zh ? "构象与姿势质控结果" : "Pose quality results"}
    >
      <p role="status">
        {result.classification === "passes"
          ? zh
            ? "已通过全部适用检查"
            : "All applicable checks passed"
          : result.classification === "fails"
            ? zh
              ? "存在需要复核的项目"
              : "Some checks need review"
            : zh
              ? "检查未完整完成"
              : "Checks are incomplete"}{" "}
        · {zh ? "通过" : "Pass"} {counts.pass} / {result.checks.length}
      </p>
      <StructureViewer
        urls={Object.keys(result.previews_sha256).map((name) =>
          artifactUrl(job.id, name),
        )}
        language={language}
      />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{zh ? "检查项目" : "Check"}</th>
              <th>{zh ? "结果" : "Outcome"}</th>
            </tr>
          </thead>
          <tbody>
            {result.checks.map((row) => (
              <tr key={row.id}>
                <td title={row.id}>
                  {checkLabels[row.id]?.[zh ? 0 : 1] ?? row.id}
                </td>
                <td>{outcome[row.outcome]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Hint
        label={
          zh
            ? "如何处理不通过或未计算？"
            : "What to do with failures or missing checks?"
        }
      >
        {zh
          ? "先复核输入和三维姿势，必要时另建准备、对接或优化任务。原始分子保持原样。未能计算需查看原生诊断，不能自动视为合格；质控不是活性或亲和力预测。"
          : "Review inputs and coordinates, then create a separate preparation, docking or refinement task if needed. Original molecules remain unchanged. Missing checks need native diagnostic review and never qualify automatically. This is not activity or affinity prediction."}
      </Hint>
    </section>
  );
}
