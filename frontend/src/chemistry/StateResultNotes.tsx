import { artifactUrl } from "../api";
import type { Language } from "../types";
import type { StateResult } from "./types";

export function StateResultNotes({
  jobId,
  data,
  language,
}: {
  jobId: string;
  data: StateResult;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <details className="state-result-notes">
      <summary>
        {zh ? "结果说明与源文件" : "Result notes and source files"}
      </summary>
      <p className="field-help">
        {zh
          ? "这些是游离构象。只比较同一化学状态和力场下的能量；状态编号按枚举顺序排列。"
          : "These are free conformers. Compare energies within the same chemical state and force field. State numbers reflect enumeration order."}
      </p>
      {data.coverage.budget_limited && (
        <p className="field-help">
          {zh
            ? "枚举已达到预算上限，仍可能存在其他化学状态。"
            : "Enumeration reached its budget limit. Additional chemical states may exist."}
        </p>
      )}
      {data.coverage.rejected > 0 && (
        <p className="field-help">
          {zh
            ? "因改变已指定立体构型而排除的候选数"
            : "Candidates excluded to preserve defined stereochemistry"}{" "}
          {data.coverage.rejected}
        </p>
      )}
      {data.coverage.protonation_rejected > 0 && (
        <p className="field-help">
          {zh ? "无效的质子化候选数" : "Invalid protonation candidates"}{" "}
          {data.coverage.protonation_rejected}
        </p>
      )}
      <div className="inline-fields">
        <a href={artifactUrl(jobId, data.state_artifact)} download>
          {zh ? "下载化学状态 SDF" : "Download state SDF"}
        </a>
        {data.conformers.length > 0 && (
          <a href={artifactUrl(jobId, data.conformer_artifact)} download>
            {zh ? "下载全部构象 SDF" : "Download all conformers SDF"}
          </a>
        )}
      </div>
    </details>
  );
}
