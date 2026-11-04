import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import {
  PredictionJobReview,
  type PredictionJobReviewActions,
} from "../presentation/PredictionJobReview";
import { PredictionJobSettings } from "../presentation/PredictionJobSettings";
import {
  boltzLigandRecordUrl,
  prepareBoltzJob,
  type PreparedBoltzJob,
} from "./boltz-job-request";
import type { ScientificTask } from "./types";

export function BoltzJobReview(
  props: PredictionJobReviewActions & { input: ScientificTask },
) {
  return (
    <PredictionJobReview
      {...props}
      prepare={prepareBoltzJob}
      renderSettings={(job) => (
        <BoltzReviewSettings job={job} language={props.language} />
      )}
    />
  );
}

function BoltzReviewSettings({
  job,
  language,
}: {
  job: PreparedBoltzJob;
  language: Language;
}) {
  const zh = language === "zh";
  const { rows, files, task } = job;
  const { payload, options } = task;
  const affinityLigand = payload.affinity
    ? rows.find((row) => row.kind === "ligand")
    : undefined;
  const entries = [
    [zh ? "预测模型" : "Prediction model", "Boltz-2"],
    [zh ? "随机种子" : "Seed", options.seed],
    [zh ? "请求构象" : "Requested structures", Number(payload.samples)],
    [zh ? "循环次数" : "Recycling steps", Number(payload.recycling_steps)],
    [zh ? "采样步数" : "Sampling steps", Number(payload.sampling_steps)],
    [
      zh ? "模型亲和力" : "Model affinity",
      affinityLigand
        ? (zh ? "链 " : "Chain ") + affinityLigand.id
        : zh
          ? "关闭"
          : "Off",
    ],
    [
      zh ? "计算设备" : "Compute device",
      options.device === "cuda" ? "NVIDIA GPU" : "CPU",
    ],
    [
      zh ? "计算资源" : "Resources",
      `${options.cpu} CPU · ${options.memory_mib} MiB`,
    ],
  ] as const;

  function sourceLink(source: MoleculeRef, record = false) {
    return (
      <a
        download
        href={
          record
            ? boltzLigandRecordUrl(source)
            : `/api/assets/${encodeURIComponent(source.asset_id)}`
        }
      >
        {files.get(source.asset_id)?.name}
      </a>
    );
  }

  return (
    <PredictionJobSettings language={language} rows={entries}>
      <h3>{zh ? "链与引用材料" : "Chains and source files"}</h3>
      <ul className="job-review-chain-list">
        {rows.map((row) => (
          <li key={row.id}>
            <strong>{(zh ? "链 " : "Chain ") + row.id}</strong>
            {row.kind === "protein" ? (
              row.msa_mode === "single" ? (
                <span>
                  {zh
                    ? "仅单条序列 · 探索性基线"
                    : "Single sequence · Exploratory baseline"}
                </span>
              ) : row.msa ? (
                sourceLink(row.msa)
              ) : null
            ) : row.kind === "ligand" && row.source ? (
              <>
                {sourceLink(row.source, true)}
                <span>
                  {zh ? "原文件条目 " : "Original file record "}
                  {row.source.record + 1}
                </span>
              </>
            ) : (
              <span>
                {row.kind === "ligand" ? "SMILES" : row.kind.toUpperCase()}
              </span>
            )}
          </li>
        ))}
      </ul>
      {rows.some((row) => row.source) && (
        <p>
          {zh
            ? "Boltz-2 使用所选条目的分子身份，不使用原始三维姿势。"
            : "Boltz-2 uses the selected record’s molecular identity, without its original 3D pose."}
        </p>
      )}
      <p>
        {zh
          ? "模型亲和力为计算预测，不能替代实验测量。"
          : "Model affinity is a prediction; it does not replace an experimental measurement."}
      </p>
    </PredictionJobSettings>
  );
}
