import { PredictionJobSettings } from "../presentation/PredictionJobSettings";
import type { Language } from "../types";
import {
  PredictionJobReview,
  type PredictionJobReviewActions,
} from "../presentation/PredictionJobReview";
import {
  prepareMol1Job,
  type Mol1JobInput,
  type PreparedMol1Job,
} from "./mol1-job-request";

export function Mol1JobReview(
  props: PredictionJobReviewActions & { input: Mol1JobInput },
) {
  return (
    <PredictionJobReview
      {...props}
      prepare={prepareMol1Job}
      renderSettings={(job) => (
        <Mol1ReviewSettings job={job} language={props.language} />
      )}
    />
  );
}
function Mol1ReviewSettings({
  job,
  language,
}: {
  job: PreparedMol1Job;
  language: Language;
}) {
  const zh = language === "zh";
  const { settings, task } = job;
  const msa = {
    none: zh ? "不使用 MSA" : "No MSA",
    uploaded: zh ? "使用上传的 MSA" : "Uploaded MSA",
    search: zh ? "远程搜索" : "Remote search",
  }[settings.feature_mode];
  const rows = [
    [zh ? "预测模型" : "Prediction model", "Mol-1 base"],
    [
      zh ? "随机种子" : "Seeds",
      [task.options.seed, ...settings.additional_seeds].join(", "),
    ],
    [
      zh ? "请求构象" : "Requested structures",
      settings.samples * (settings.additional_seeds.length + 1),
    ],
    ["MSA", msa],
    [
      zh ? "联网权限" : "Network access",
      settings.allow_network
        ? zh
          ? "已允许"
          : "Allowed"
        : zh
          ? "未允许"
          : "Not allowed",
    ],
    [
      zh ? "模板搜索或输入" : "Templates",
      settings.use_template ? (zh ? "启用" : "Enabled") : zh ? "关闭" : "Off",
    ],
    [zh ? "共价连接" : "Covalent bonds", job.bonds.length],
  ] as const;
  const secondaryRows = [
    [
      zh ? "计算设备" : "Compute device",
      task.options.device === "cuda" ? "NVIDIA GPU" : "CPU",
    ],
    [zh ? "内存上限" : "Memory limit", `${task.options.memory_mib} MiB`],
  ] as const;
  const roleName = {
    ligand: zh ? "配体" : "Ligand",
    sequence: zh ? "序列" : "Sequence",
    msa: "MSA",
    template: zh ? "模板" : "Template",
  };
  return (
    <PredictionJobSettings
      language={language}
      rows={rows}
      secondaryRows={secondaryRows}
    >
      {job.files.length > 0 && (
        <>
          <h3>{zh ? "已核对的引用文件" : "Verified source files"}</h3>
          <ul>
            {job.files.map(({ name, input }) => (
              <li key={input.source.asset_id}>
                <span>{roleName[input.role as keyof typeof roleName]}</span>
                <a
                  download
                  href={`/api/assets/${encodeURIComponent(input.source.asset_id)}`}
                >
                  {name}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        {zh
          ? "结果为结构预测和模型置信度，不能替代实验亲和力。"
          : "Results are structural predictions and model confidence, not measured affinity."}
      </p>
    </PredictionJobSettings>
  );
}
