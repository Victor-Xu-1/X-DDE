import { StructureWorkbench } from "../presentation/StructureWorkbench";
import type { Job, Language } from "../types";
import { QualityPreview } from "./QualityPreview";
import { QualityMeasurements } from "./QualityMeasurements";
import type { PoseQualityResult } from "./types";
import { QualityCheckList } from "./QualityCheckList";
import { assessQuality, type AssessmentOutcome } from "./assessment";
import { assessmentLabels } from "./labels";
import "../presentation/result-inspection.css";
import "./quality-results.css";

export function QualityResults({
  job,
  result,
  language,
}: {
  job: Job;
  result: PoseQualityResult;
  language: Language;
}) {
  const zh = language === "zh";
  const assessment = assessQuality(result);
  return (
    <section
      className="discovery-results quality-results"
      aria-label={zh ? "构象与姿势质控结果" : "Pose quality results"}
    >
      <p
        role="status"
        className="quality-assessment-summary"
        aria-label={zh ? "质控评估摘要" : "Quality assessment summary"}
      >
        <strong>
          {assessment.classification === "passes"
            ? zh
              ? "已通过全部适用检查"
              : "All applicable checks passed"
            : assessment.classification === "fails"
              ? zh
                ? "存在需要复核的项目"
                : "Some checks need review"
              : assessment.counts.unassessed > 0
                ? zh
                  ? "部分项目未评估"
                  : "Some checks were not assessed"
                : zh
                  ? "检查未完整完成"
                  : "Checks are incomplete"}
        </strong>
        <span className="quality-assessment-counts">
          {(Object.keys(assessment.counts) as AssessmentOutcome[])
            .filter((id) => assessment.counts[id] > 0)
            .map((id) => (
              <span key={id} className={"quality-outcome is-" + id}>
                {assessmentLabels[id][zh ? 0 : 1]}: {assessment.counts[id]}
              </span>
            ))}
        </span>
      </p>
      <StructureWorkbench
        preview={
          <div className="result-inspection-detail">
            <QualityPreview
              key={job.id}
              job={job}
              result={result}
              language={language}
            />
          </div>
        }
      >
        <QualityMeasurements result={result} language={language} />
        <QualityCheckList
          key={job.id}
          checks={assessment.checks}
          language={language}
        />
      </StructureWorkbench>
      <details className="quality-method-details">
        <summary>
          {zh ? "方法与评估范围" : "Method and assessment scope"}
        </summary>
        <p>
          {zh
            ? `原始报告：${assessment.nativeCounts.pass} 项通过，${assessment.nativeCounts.fail} 项需复核，${assessment.nativeCounts.unavailable} 项未能计算。原始报告和坐标保持完整，本页另行标出未评估及不适用的项目。`
            : `Source report: ${assessment.nativeCounts.pass} passed, ${assessment.nativeCounts.fail} need review, ${assessment.nativeCounts.unavailable} were not calculated. Original reports and coordinates are retained; this view separately identifies unassessed and inapplicable items.`}
        </p>
        <p>
          {zh
            ? "本页的“未评估”表示报告没有提供有效几何测量，不改写原始判定。原程序可能在检测范围内没有相关原子时给出“无碰撞”；这不能证明真实体系中没有水或辅因子。分子靠近受体，也不排除距离过近的碰撞。"
            : "Here, not assessed means that the report contains no valid geometric measurement; the original decision is retained. The engine may report no clash when no matching atoms are in its search range. This does not establish that water or cofactors are absent in the biological system. Being near a receptor does not rule out an overly close clash."}
        </p>
        <p>
          {zh
            ? "先复核输入和三维姿势，必要时另建准备、对接或优化任务。原始分子保持原样。未能计算时需要复核输入或计算条件，不能自动视为合格；质控不是活性或亲和力预测。"
            : "Review inputs and coordinates, then create a separate preparation, docking or refinement task if needed. Original molecules remain unchanged. Missing checks need input or compute-condition review and never qualify automatically. This is not activity or affinity prediction."}
        </p>
      </details>
    </section>
  );
}
