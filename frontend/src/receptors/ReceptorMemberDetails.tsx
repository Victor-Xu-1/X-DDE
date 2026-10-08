import { artifactUrl } from "../api";
import type { Language } from "../types";
import type { MemberEvidence } from "./types";

export function ReceptorMemberDetails({
  member,
  jobId,
  language,
}: {
  member: MemberEvidence;
  jobId: string;
  language: Language;
}) {
  const zh = language === "zh";
  const match = member.correspondence,
    quality = member.quality;
  return (
    <div className="receptor-member-details">
      {member.reason && <p role="status">{member.reason}</p>}
      {quality && !quality.backbone_complete && (
        <p role="status" className="field-help">
          {zh
            ? "骨架不完整，仅用于几何比较。"
            : "Incomplete backbone; geometry comparison only."}
        </p>
      )}
      <details>
        <summary>
          {zh ? "匹配范围与结构质量" : "Matching scope and structure quality"}
        </summary>
        <dl className="ensemble-member-metrics">
          {match && (
            <>
              <div>
                <dt>{zh ? "匹配锚点" : "Matched anchors"}</dt>
                <dd>{match.pair_count}</dd>
              </div>
              <div>
                <dt>{zh ? "序列一致率" : "Sequence identity"}</dt>
                <dd title={String(match.identity)}>
                  {(match.identity * 100).toFixed(1)}%
                </dd>
              </div>
              <div>
                <dt>{zh ? "覆盖率" : "Coverage"}</dt>
                <dd title={String(match.coverage)}>
                  {(match.coverage * 100).toFixed(1)}%
                </dd>
              </div>
            </>
          )}
          {quality && (
            <>
              <div>
                <dt>{zh ? "模型" : "Model"}</dt>
                <dd>{quality.selected_model_index + 1}</dd>
              </div>
              <div>
                <dt>{zh ? "链" : "Chains"}</dt>
                <dd>{quality.selected_chains.join(", ")}</dd>
              </div>
              <div>
                <dt>{zh ? "原子" : "Atoms"}</dt>
                <dd>{quality.atom_count}</dd>
              </div>
            </>
          )}
        </dl>
      </details>
      <div className="receptor-actions">
        <a href={"/api/assets/" + member.source.structure.asset_id} download>
          {zh ? "下载原始结构" : "Download original structure"}
        </a>
        {member.artifact && (
          <a href={artifactUrl(jobId, member.artifact)} download>
            {zh ? "下载对齐结构" : "Download aligned structure"}
          </a>
        )}
      </div>
    </div>
  );
}
