import {
  PredictionJobReview,
  type PredictionJobReviewActions,
} from "../presentation/PredictionJobReview";
import { PredictionJobSettings } from "../presentation/PredictionJobSettings";
import { assetDownloadUrl } from "../research/asset-download";
import type { Language, Prediction } from "../types";
import {
  prepareOpenDdeJob,
  type PreparedOpenDdeJob,
} from "./opendde-job-request";
import type { BondAtom } from "./types";

export function OpenDdeJobReview(
  props: PredictionJobReviewActions<Prediction> & { input: Prediction },
) {
  return (
    <PredictionJobReview
      {...props}
      prepare={prepareOpenDdeJob}
      renderSettings={(job) => (
        <OpenDdeSettings job={job} language={props.language} />
      )}
    />
  );
}

function OpenDdeSettings({
  job,
  language,
}: {
  job: PreparedOpenDdeJob;
  language: Language;
}) {
  const zh = language === "zh";
  const { parameters: p, covalent_bonds: bonds, project_id } = job.task;
  const seeds = [p.seed, ...(p.additional_seeds ?? [])];
  const msa = {
    none: zh ? "不使用 MSA" : "No MSA",
    uploaded: zh ? "使用上传的 MSA" : "Uploaded MSA",
    search: zh ? "远程搜索" : "Remote search",
  }[p.feature_mode ?? "none"];
  const onOff = (value?: boolean) =>
    value ? (zh ? "开启" : "On") : zh ? "关闭" : "Off";
  const rows = [
    [
      zh ? "预测模型" : "Prediction model",
      p.model === "abag" ? "OpenDDE ABAG" : "OpenDDE",
    ],
    ...(p.checkpoint_id
      ? [[zh ? "模型权重" : "Checkpoint", p.checkpoint_id] as const]
      : []),
    [zh ? "随机种子" : "Seeds", seeds.join(", ")],
    [zh ? "每个种子的构象数" : "Structures per seed", p.samples],
    ["MSA", msa],
    [zh ? "结构模板" : "Structure templates", onOff(p.use_template)],
    [zh ? "RNA MSA" : "RNA MSA", onOff(p.use_rna_msa)],
    [
      zh ? "远程数据传输" : "Remote data transfer",
      p.allow_network
        ? zh
          ? "已允许"
          : "Allowed"
        : zh
          ? "未允许"
          : "Not allowed",
    ],
    [zh ? "共价键" : "Covalent bonds", bonds?.length ?? 0],
  ] as const;
  const secondaryRows = [
    [zh ? "扩散步数" : "Diffusion steps", p.steps],
    [zh ? "循环次数" : "Recycling cycles", p.cycles],
    [
      zh ? "计算设备" : "Compute device",
      p.device === "cpu" ? "CPU" : "NVIDIA GPU",
    ],
    [zh ? "计算精度" : "Precision", p.dtype.toUpperCase()],
  ] as const;
  const atom = (site: BondAtom) => {
    const copy = site.copy_index;
    const chain =
      copy === null
        ? undefined
        : job.components[site.entity - 1]?.chain_ids?.[copy - 1];
    const copyLabel =
      copy === null
        ? zh
          ? "未指定副本"
          : "Copy unspecified"
        : zh
          ? `副本 ${copy}`
          : `Copy ${copy}`;
    const name = chain
      ? zh
        ? `链 ${chain}`
        : `Chain ${chain}`
      : zh
        ? `组分 ${site.entity} · ${copyLabel}`
        : `Entity ${site.entity} · ${copyLabel}`;
    return `${name} · ${site.position}:${site.atom}`;
  };
  return (
    <PredictionJobSettings
      language={language}
      rows={rows}
      secondaryRows={secondaryRows}
    >
      {project_id && (
        <p>
          {zh
            ? "结果将归入所选项目。"
            : "Results will be saved in the selected project."}
        </p>
      )}
      {job.files.size > 0 && (
        <>
          <h3>{zh ? "引用材料" : "Source files"}</h3>
          <ul className="job-review-chain-list">
            {[...job.files.values()].map((file) => (
              <li key={file.id}>
                <a download href={assetDownloadUrl(file.id)}>
                  {file.name}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {Boolean(bonds?.length) && (
        <>
          <h3>{zh ? "共价连接位点" : "Covalent bond endpoints"}</h3>
          <ul className="job-review-chain-list">
            {bonds?.map((bond, index) => (
              <li key={index}>
                {atom(bond.left)} ↔ {atom(bond.right)}
              </li>
            ))}
          </ul>
        </>
      )}
    </PredictionJobSettings>
  );
}
