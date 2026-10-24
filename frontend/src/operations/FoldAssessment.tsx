import type { Job, Language } from "../types";
import { foldAssessment } from "./fold-assessment";

export function FoldAssessment({
  job,
  candidate,
  language,
}: {
  job: Job;
  candidate: Record<string, unknown>;
  language: Language;
}) {
  if (job.request.operation !== "harness" || job.request.tool !== "fold")
    return null;
  const zh = language === "zh",
    assessment = foldAssessment(job, candidate);
  const labels = zh
    ? {
        passed: "原生界面检查通过",
        failed: "原生界面检查未通过",
        missing: "未提供界面检查结果",
        inconsistent: "界面检查记录不一致",
      }
    : {
        passed: "Native interface check passed",
        failed: "Native interface check not passed",
        missing: "Interface check not reported",
        inconsistent: "Interface check records inconsistent",
      };
  return (
    <section
      className="fold-assessment"
      aria-label={zh ? "界面质量评估" : "Interface assessment"}
      data-state={assessment.gate}
    >
      <h3>{zh ? "界面质量评估" : "Interface assessment"}</h3>
      <p role="status">
        <strong>{labels[assessment.gate]}</strong>
      </p>
      {assessment.cdrRelevant && !assessment.annotated && (
        <p>
          {zh
            ? "缺少完整、有效的 CDR 位置注释，CDR 与框架接触比例无法解释。"
            : "Complete, valid CDR position annotations are missing; CDR and framework contact fractions cannot be interpreted."}
        </p>
      )}
      {assessment.cdrRelevant &&
        assessment.annotated &&
        !assessment.fractions && (
          <p>
            {zh
              ? "未提供可解释的 CDR 与框架接触比例。"
              : "Interpretable CDR and framework contact fractions are not available."}
          </p>
        )}
      {assessment.fractions && (
        <dl>
          <div>
            <dt>{zh ? "CDR 接触残基占比" : "CDR contact residue fraction"}</dt>
            <dd>{(assessment.fractions.cdr * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt>
              {zh ? "框架接触残基占比" : "Framework contact residue fraction"}
            </dt>
            <dd>{(assessment.fractions.framework * 100).toFixed(1)}%</dd>
          </div>
        </dl>
      )}
      {assessment.epitopeSkipped && (
        <p>
          {assessment.noHotspots
            ? zh
              ? "未指定靶点残基，表位检查尚未评估。"
              : "Epitope check not assessed: no target residues were specified."
            : zh
              ? "原生程序未评估表位检查。"
              : "Epitope check was not assessed by the native program."}
        </p>
      )}
      <p className="field-help">
        {zh
          ? "这是原生规则检查；计算完成与置信度分数均不等于实验结合验证。"
          : "This is a native rule check; computation completion and confidence scores are not experimental binding validation."}
      </p>
    </section>
  );
}
