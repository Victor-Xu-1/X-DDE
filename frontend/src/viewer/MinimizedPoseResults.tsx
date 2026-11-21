import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { artifactUrl } from "../api";
import type { Job, Language } from "../types";
import { MolecularPreview } from "../presentation/MolecularPreview";
import "../presentation/pose-review-workspace.css";
import type { PoseEnergy } from "./pose-types";

export function MinimizedPoseResults({
  job,
  data,
  language,
}: {
  job: Job;
  data: {
    energy_before: number;
    energy_after: number;
    method: PoseEnergy["method"];
    converged: boolean;
    artifact: string;
    artifact_sha256: string;
  };
  language: Language;
}) {
  const zh = language === "zh",
    url = artifactUrl(job.id, data.artifact);
  return (
    <section
      className="pose-review-workspace minimized-pose-results"
      aria-label={zh ? "能量最小化结果" : "Energy minimization results"}
    >
      <StructureWorkbench
        preview={
          <MolecularPreview
            label={zh ? "已保存的 pose" : "Saved pose"}
            language={language}
            source={{ url, sha256: data.artifact_sha256 }}
            urls={[url]}
            nativeArtifactSha256={data.artifact_sha256}
            defaultView="3d"
          />
        }
      >
        <dl className="minimized-pose-metrics">
          <div>
            <dt>{zh ? "优化前" : "Before"}</dt>
            <dd>{data.energy_before.toFixed(2)} kcal/mol</dd>
          </div>
          <div>
            <dt>{zh ? "优化后" : "After"}</dt>
            <dd>{data.energy_after.toFixed(2)} kcal/mol</dd>
          </div>
          <div>
            <dt>{zh ? "方法" : "Method"}</dt>
            <dd>{data.method}</dd>
          </div>
          <div>
            <dt>{zh ? "收敛状态" : "Convergence"}</dt>
            <dd>
              {data.converged
                ? zh
                  ? "已收敛"
                  : "Converged"
                : zh
                  ? "已保存 · 尚未收敛"
                  : "Saved · Not converged"}
            </dd>
          </div>
        </dl>
        <details className="minimized-pose-context">
          <summary>{zh ? "游离配体优化说明" : "About unbound ligand minimization"}</summary>
          <p className="field-help">
            {zh
              ? "这是仅考虑配体的分子内优化，不考虑蛋白；能量下降不代表口袋姿势改善，可能产生受体碰撞。请与对应受体一起检查并进行姿势质控。能量不能作为结合亲和力；原 pose 保留在历史文件中。"
              : "This ligand-only minimization does not include the protein. Lower energy does not establish a better binding pose and may introduce receptor clashes. Inspect the matching receptor and check pose quality. The energy is not binding affinity; the original pose remains in history."}
          </p>
        </details>
        <a
          className="secondary-button"
          href={url}
          download="X-DDE-minimized-pose.sdf"
        >
          {zh ? "下载 pose SDF" : "Download pose SDF"}
        </a>
      </StructureWorkbench>
    </section>
  );
}
