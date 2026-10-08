import { artifactUrl } from "../api";
import { Hint } from "../guided/Hint";
import type { Job, Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import type { PoseQualityResult } from "./types";
import { QualityCheckList } from "./QualityCheckList";
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
  const zh = language === "zh",
    counts = { pass: 0, fail: 0, unavailable: 0 };
  result.checks.forEach((row) => counts[row.outcome]++);
  return (
    <section
      className="discovery-results quality-results"
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
      <div className="result-inspection">
        <QualityCheckList
          key={job.id}
          checks={result.checks}
          language={language}
        />
        <div className="result-inspection-detail">
          {Object.keys(result.previews_sha256).length > 0 ? (
            <StructureViewer
              urls={Object.keys(result.previews_sha256)
                .sort((a, b) =>
                  a.endsWith(".pdb") ? -1 : b.endsWith(".pdb") ? 1 : 0,
                )
                .map((name) => artifactUrl(job.id, name))}
              language={language}
              molecularSource={{
                url: artifactUrl(job.id, "molecule-preview.sdf"),
              }}
              focusModel={result.inputs.protein ? 1 : 0}
            />
          ) : (
            <div className="result-inspection-empty" role="status">
              <p>
                {zh
                  ? "本次质控未提供可预览的结构。"
                  : "This quality result contains no preview structure."}
              </p>
            </div>
          )}
        </div>
      </div>
      <Hint
        label={
          zh
            ? "如何处理不通过或未计算？"
            : "What to do with failures or missing checks?"
        }
      >
        {zh
          ? "先复核输入和三维姿势，必要时另建准备、对接或优化任务。原始分子保持原样。未能计算时需要复核输入或计算条件，不能自动视为合格；质控不是活性或亲和力预测。"
          : "Review inputs and coordinates, then create a separate preparation, docking or refinement task if needed. Original molecules remain unchanged. Missing checks need input or compute-condition review and never qualify automatically. This is not activity or affinity prediction."}
      </Hint>
    </section>
  );
}
