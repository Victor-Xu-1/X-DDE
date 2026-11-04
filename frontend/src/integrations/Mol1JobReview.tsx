import { useEffect, useState } from "react";
import type { Job, Language } from "../types";
import { EnvironmentRecheck } from "../guided/EnvironmentRecheck";
import { PredictionEntityPreview } from "../presentation/PredictionEntityPreview";
import { PredictionReviewDialog } from "../presentation/PredictionReviewDialog";
import { researchError } from "../presentation/research-content";
import {
  prepareMol1Job,
  type Mol1JobInput,
  type PreparedMol1Job,
} from "./mol1-job-request";
import type { ScientificTask } from "./types";
import "./mol1-job-review.css";

export function Mol1JobReview({
  language,
  input,
  ready,
  unavailable,
  recheck,
  busy,
  error,
  confirm,
  onClose,
  submit,
}: {
  language: Language;
  input: Mol1JobInput;
  ready: boolean | undefined;
  unavailable: string;
  recheck(): void;
  busy: boolean;
  error: string;
  confirm(send: () => Promise<Job | undefined>): Promise<void>;
  onClose(): void;
  submit(task: ScientificTask): Promise<Job | undefined>;
}) {
  const zh = language === "zh";
  const identity = JSON.stringify(input);
  const [state, setState] = useState<
    | { identity: string; result: PreparedMol1Job }
    | { identity: string; error: string }
    | null
  >(null);
  const [attempt, retry] = useState(0);
  const [technical, setTechnical] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setState(null);
    void prepareMol1Job(
      JSON.parse(identity) as Mol1JobInput,
      controller.signal,
    ).then(
      (result) => {
        if (!controller.signal.aborted) setState({ identity, result });
      },
      (reason: unknown) => {
        if (!controller.signal.aborted)
          setState({
            identity,
            error: String(reason instanceof Error ? reason.message : reason),
          });
      },
    );
    return () => controller.abort();
  }, [identity, attempt]);
  const current = state?.identity === identity ? state : null;
  const prepared = current && "result" in current ? current.result : null;

  return (
    <PredictionReviewDialog
      language={language}
      title={zh ? "预览任务" : "Preview job"}
      job
      busy={busy}
      onClose={onClose}
      actions={
        <button
          type="button"
          className="primary-button"
          disabled={!ready || !prepared || busy}
          onClick={() => {
            if (ready && prepared && !busy)
              void confirm(() => submit(prepared.task));
          }}
        >
          {busy
            ? zh
              ? "正在提交…"
              : "Submitting…"
            : zh
              ? "提交任务"
              : "Submit job"}
        </button>
      }
    >
      {!current && (
        <p role="status">
          {zh ? "正在核对研究文件…" : "Checking research files…"}
        </p>
      )}
      {current && "error" in current && (
        <div role="alert" className="error-box">
          <p>
            {zh
              ? "无法核对所选文件。请重试，或返回编辑更换材料。"
              : "The selected files could not be verified. Try again or return to edit them."}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setState(null);
              retry((n) => n + 1);
            }}
          >
            {zh ? "重新核对文件" : "Check files again"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error-box">
          {researchError(error, zh)}
        </p>
      )}
      {prepared && (
        <div className="mol1-review-grid">
          <div className="mol1-review-primary">
            <div className="mol1-review-identity">
              <strong>{prepared.task.name}</strong>
              <span>
                {prepared.components.length} {zh ? "个组分" : "entities"} ·{" "}
                {prepared.components.reduce(
                  (n, component) => n + component.count,
                  0,
                )}{" "}
                {zh ? "条链/分子" : "chains/molecules"}
              </span>
            </div>
            <div
              className="mol1-review-tabs"
              role="group"
              aria-label={zh ? "任务预览视图" : "Job preview view"}
            >
              <button
                type="button"
                aria-pressed={!technical}
                onClick={() => setTechnical(false)}
              >
                {zh ? "概览" : "Overview"}
              </button>
              <button
                type="button"
                aria-pressed={technical}
                onClick={() => setTechnical(true)}
              >
                {zh ? "提交内容" : "Request JSON"}
              </button>
            </div>
            {technical ? (
              <div className="mol1-review-payload">
                <p>
                  {zh
                    ? "这是发送到 X-DDE 的请求。引擎输入由服务器另行生成。"
                    : "This is the request sent to X-DDE. The server prepares the engine input separately."}
                </p>
                <pre
                  tabIndex={0}
                  aria-label={
                    zh ? "X-DDE 提交请求" : "X-DDE submission request"
                  }
                >
                  {JSON.stringify(prepared.task, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="prediction-preview-entities">
                {prepared.components.map((item, index) => (
                  <PredictionEntityPreview
                    key={index}
                    item={item}
                    index={index}
                    language={language}
                    initiallyExpanded={false}
                  />
                ))}
              </div>
            )}
          </div>
          <Mol1ReviewSettings job={prepared} language={language} />
        </div>
      )}
      {!ready && (
        <div className="mol1-review-availability">
          <p role="status" className="notice">
            {ready === undefined
              ? zh
                ? "正在检查计算环境…"
                : "Checking the calculation environment…"
              : unavailable}
          </p>
          <EnvironmentRecheck
            ready={ready}
            onRecheck={recheck}
            language={language}
            busy={busy}
          />
        </div>
      )}
    </PredictionReviewDialog>
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
    [
      zh ? "计算设备" : "Compute device",
      task.options.device === "cuda" ? "NVIDIA GPU" : "CPU",
    ],
    [zh ? "内存上限" : "Memory limit", `${task.options.memory_mib} MiB`],
  ];
  const roleName = {
    ligand: zh ? "配体" : "Ligand",
    sequence: zh ? "序列" : "Sequence",
    msa: "MSA",
    template: zh ? "模板" : "Template",
  };
  return (
    <aside
      className="mol1-review-settings"
      aria-label={zh ? "预测设置" : "Prediction settings"}
    >
      <h3>{zh ? "预测设置" : "Prediction settings"}</h3>
      <dl>
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
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
    </aside>
  );
}
