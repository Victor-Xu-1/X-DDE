import { api } from "../api";
import { PredictionEntityPreview } from "../presentation/PredictionEntityPreview";
import {
  PredictionJobReview,
  type PredictionJobReviewActions,
} from "../presentation/PredictionJobReview";
import { PredictionJobSettings } from "../presentation/PredictionJobSettings";
import { assetDownloadUrl } from "../research/asset-download";
import type { Component, Language } from "../types";
import { record } from "./candidate-sequence-model";
import type { HarnessTask } from "./types";
import "./fold-job-review.css";

interface SourceFile {
  id: string;
  name: string;
}
interface FoldChain {
  chain: string;
  sequence: string;
  files: (SourceFile & { role: "paired" | "unpaired" | "template" })[];
}
interface FoldReviewData {
  target: FoldChain[];
  candidates: {
    name: string;
    chains: FoldChain[];
    replaced_target_chains: string[];
  }[];
  source_files: SourceFile[];
}

function component(chain: FoldChain): Component {
  return {
    kind: "protein",
    value: chain.sequence,
    count: 1,
    chain_ids: [chain.chain],
  };
}

async function prepareFold(task: HarnessTask, signal: AbortSignal) {
  const data = await api.authorized<FoldReviewData>("/harness/fold/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  });
  const groups = [
    data.target,
    ...data.candidates.map((candidate) => candidate.chains),
  ];
  return {
    task,
    data,
    components: groups.flatMap((chains) => chains.map(component)),
  };
}

export function FoldJobReview(
  props: PredictionJobReviewActions<HarnessTask> & { input: HarnessTask },
) {
  return (
    <PredictionJobReview
      {...props}
      prepare={prepareFold}
      renderOverview={({ data, task }) => (
        <FoldOverview
          data={data}
          options={record(task.payload.options)}
          language={props.language}
        />
      )}
      renderSettings={({ data, task }) => (
        <FoldSettings data={data} task={task} language={props.language} />
      )}
    />
  );
}

function FoldOverview({
  data,
  options,
  language,
}: {
  data: FoldReviewData;
  options: Record<string, unknown>;
  language: Language;
}) {
  const zh = language === "zh";
  const labels = {
    unpaired: zh ? "单链 MSA" : "Unpaired MSA",
    paired: zh ? "配对 MSA" : "Paired MSA",
    template: zh ? "模板" : "Template",
  };
  const groups = [
    {
      name: zh ? "靶标" : "Target",
      chains: data.target,
      replaced_target_chains: [],
    },
    ...data.candidates,
  ];
  return (
    <div className="fold-review-groups">
      {groups.map(({ name, chains, replaced_target_chains }, index) => (
        <section className="fold-review-group" key={index} aria-label={name}>
          <h3>{name}</h3>
          {replaced_target_chains.length > 0 && (
            <p className="field-help">
              {zh
                ? "此候选替换了同名靶标链"
                : "This candidate replaces target chains with the same IDs"}
              {" · "}
              {replaced_target_chains.join(", ")}
            </p>
          )}
          {chains.map((chain, chainIndex) => (
            <PredictionEntityPreview
              key={chain.chain}
              index={chainIndex}
              item={component(chain)}
              language={language}
              title={(zh ? "链 " : "Chain ") + chain.chain}
              summary={chain.sequence.replace(/\s/g, "").length + " aa"}
              initiallyExpanded={false}
            >
              {chain.files.length > 0 && (
                <ul className="prediction-preview-files">
                  {chain.files.map(({ id, name, role }, fileIndex) => (
                    <li key={fileIndex}>
                      <a download href={assetDownloadUrl(id)}>
                        {labels[role]} · {name}
                      </a>
                      {role !== "template" && options.use_msa === false && (
                        <span>
                          {" "}
                          · {zh ? "本次禁用" : "Disabled for this run"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </PredictionEntityPreview>
          ))}
        </section>
      ))}
    </div>
  );
}

function FoldSettings({
  data,
  task,
  language,
}: {
  data: FoldReviewData;
  task: HarnessTask;
  language: Language;
}) {
  const zh = language === "zh";
  const options = record(task.payload.options);
  const rows: [string, string | number][] = [
    [zh ? "预测方法" : "Prediction method", "Harness / OpenDDE"],
    [zh ? "候选数" : "Candidates", data.candidates.length],
    [
      zh ? "外部服务" : "External compute",
      task.allow_external
        ? zh
          ? "已授权"
          : "Authorized"
        : zh
          ? "未授权"
          : "Not authorized",
    ],
    [
      "MSA",
      options.use_msa === false
        ? zh
          ? "已禁用"
          : "Disabled"
        : options.use_msa === true
          ? zh
            ? "已启用"
            : "Enabled"
          : zh
            ? "引擎默认"
            : "Engine default",
    ],
  ];
  if (
    options.use_msa !== false &&
    typeof options.enable_msa_search === "boolean"
  )
    rows.push([
      zh ? "比对搜索" : "Alignment search",
      options.enable_msa_search ? (zh ? "开启" : "On") : zh ? "关闭" : "Off",
    ]);
  if (Array.isArray(options.seeds) && options.seeds.every(Number.isSafeInteger))
    rows.push([zh ? "随机种子" : "Seeds", options.seeds.join(", ")]);
  for (const [key, label] of [
    ["diffusion_samples", zh ? "采样数" : "Samples"],
    ["diffusion_steps", zh ? "扩散步数" : "Diffusion steps"],
    ["recycling_cycles", zh ? "循环次数" : "Recycling cycles"],
  ]) {
    const value = options[key];
    if (typeof value === "number") rows.push([label, value]);
  }
  return (
    <PredictionJobSettings language={language} rows={rows}>
      {data.source_files.length > 0 && (
        <>
          <h3>{zh ? "请求中的引用材料" : "Source files in this request"}</h3>
          <ul className="job-review-chain-list">
            {data.source_files.map(({ id, name }) => (
              <li key={id}>
                <a download href={assetDownloadUrl(id)}>
                  {name}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </PredictionJobSettings>
  );
}
