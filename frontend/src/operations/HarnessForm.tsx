import { useState } from "react";
import { useExample } from "../examples/context";
import {
  exampleHarnessPayload,
  exampleHarnessInputs,
} from "../examples/harness";
import { request } from "../api";
import type { Job, Language } from "../types";
import { harnessDefaults, harnessFields } from "./harness-fields";
import { HarnessField } from "./HarnessField";
import { FoldInputs } from "./FoldInputs";
import { JsonEditor } from "./ScientificInputs";
import { useTaskSubmit } from "./useTaskSubmit";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { canGuide } from "./guided-contract";
import { tools } from "./catalog";
import { Questionnaire } from "../guided/Questionnaire";
import { HarnessReview } from "./HarnessReview";
import { useHarnessSources } from "./useHarnessSources";
import {
  harnessInputsComplete,
  harnessMaterialsComplete,
} from "./harness-questionnaire-model";

export function HarnessForm({
  tool,
  language,
  onCreated,
}: {
  tool: string;
  language: Language;
  onCreated(j: Job): void;
}) {
  const example = useExample();
  const zh = language === "zh",
    [payload, setPayload] = useState<Record<string, unknown>>(() =>
      exampleHarnessPayload(tool, harnessDefaults[tool], example),
    ),
    [expert, setExpert] = useState(false),
    [external, setExternal] = useState(false),
    [setupError, setSetupError] = useState(""),
    [name, setName] = useState(""),
    run = useTaskSubmit(onCreated);
  const readiness = useTaskReadiness(tool);
  const validName = name.trim().length <= 80;
  const needsExternal = [
    "target-msa",
    "protrek-sequence",
    "protrek-structure",
    "fold",
  ].includes(tool);
  function normalize() {
    const result = structuredClone(payload);
    if (tool === "esm")
      result.sequences = (result.sequences as string[])
        .map((s) => s.replace(/\s/g, "").toUpperCase())
        .filter(Boolean);
    if (tool === "mpnn" && !Array.isArray(result.mutable_positions))
      result.mutable_positions = Object.entries(
        result.mutable_positions as Record<string, number[]>,
      ).flatMap(([chain, positions]) => positions.map((p) => `${chain}:${p}`));
    if (
      tool === "structure" &&
      (!Array.isArray(result.candidate_names) ||
        (result.candidate_names as string[]).length !==
          (result.structure_paths as string[]).length)
    )
      result.candidate_names = (result.structure_paths as string[]).map(
        (_, i) => `candidate-${i + 1}`,
      );
    if (tool === "evolution" && !result.current_parent_id)
      delete result.current_parent_id;
    if (tool === "evolution" && !expert)
      result.minimize = result.objective_key !== "iptm";
    return result;
  }
  const sources = useHarnessSources(
    payload,
    harnessInputsComplete(tool, payload)
      ? exampleHarnessInputs(tool, payload, example)
      : [],
  );
  const renderFields = (required: boolean, region = false) =>
    harnessFields[tool]
      ?.filter(
        (field) =>
          Boolean(field.required) === required &&
          (required
            ? region
              ? field.kind === "positions"
              : field.kind !== "positions"
            : field.kind !== "cdr" && field.kind !== "json"),
      )
      .map((field) => (
        <HarnessField
          key={field.key}
          field={field}
          tool={tool}
          payload={payload}
          onChange={(v) => setPayload({ ...payload, [field.key]: v })}
          language={language}
        />
      ));
  const mode = (
    <>
      {" "}
      <div
        className="segmented"
        role="group"
        aria-label={zh ? "操作模式" : "Interaction mode"}
      >
        <button
          type="button"
          aria-pressed={!expert}
          onClick={() => {
            if (canGuide(tool, payload)) {
              setExpert(false);
              setSetupError("");
            } else {
              setSetupError(
                zh
                  ? "当前原生字段不能由简易表单完整表达，请在专家模式继续编辑。"
                  : "These native fields cannot be represented losslessly in the guided form. Continue in Expert mode.",
              );
            }
          }}
        >
          {zh ? "简易模式" : "Guided mode"}
        </button>
        <button
          type="button"
          aria-pressed={expert}
          onClick={() => {
            try {
              setPayload(normalize());
              setExpert(true);
            } catch (error) {
              setSetupError(String(error));
            }
          }}
        >
          {zh ? "专家模式" : "Expert mode"}
        </button>
      </div>
    </>
  );
  const inputFields = expert ? (
    <>
      <p className="notice">
        {zh
          ? "原生参数中的残基位置从 0 开始。文件字段使用 asset:上传文件ID；连接地址、密钥和执行路径由服务器管理。"
          : "Native residue indices start at 0. File fields use asset:uploaded-file-ID; endpoints, credentials and executable paths are server-managed."}
      </p>
      <JsonEditor
        value={payload}
        onChange={setPayload}
        label={zh ? "完整原生科学参数" : "Full native scientific parameters"}
      />
    </>
  ) : tool === "fold" ? (
    <FoldInputs value={payload} onChange={setPayload} language={language} />
  ) : (
    <>{renderFields(true)}</>
  );
  const inputs = (
    <>
      {inputFields}
      {sources.loading && (
        <p role="status">
          {zh ? "正在核对研究文件…" : "Verifying selected research files…"}
        </p>
      )}
      {sources.error && (
        <div className="error-box">
          <p role="alert">
            {zh
              ? "无法核对所选研究文件。请重新读取或选择原始文件。"
              : "The selected research files could not be verified. Retry or choose the original files."}
          </p>
          <button type="button" onClick={sources.retry}>
            {zh ? "重新读取研究文件" : "Retry research files"}
          </button>
        </div>
      )}
    </>
  );
  const options = !expert ? (
    <>
      <p className="field-help">
        {zh
          ? "已使用推荐设置，可按需要调整。"
          : "Recommended settings are selected; adjust them if needed."}
      </p>
      {renderFields(true, true)}
      <div className="operation-grid">{renderFields(false)}</div>
      {harnessFields[tool]?.some(
        (f) => !f.required && ["cdr", "json"].includes(f.kind),
      ) && (
        <details>
          <summary>
            {zh
              ? "区域与其他微调（可选）"
              : "Regions & further adjustments (optional)"}
          </summary>
          {harnessFields[tool]
            .filter((f) => !f.required && ["cdr", "json"].includes(f.kind))
            .map((field) => (
              <HarnessField
                key={field.key}
                field={field}
                tool={tool}
                payload={payload}
                onChange={(v) => setPayload({ ...payload, [field.key]: v })}
                language={language}
              />
            ))}
        </details>
      )}
    </>
  ) : (
    <p className="field-help">
      {zh
        ? "本次使用第一步填写的专家参数。"
        : "This task uses the expert parameters entered in step one."}
    </p>
  );
  const execution = (
    <>
      {needsExternal && (
        <label className="network-choice">
          <input
            type="checkbox"
            checked={external}
            onChange={(e) => setExternal(e.target.checked)}
          />
          {zh
            ? "允许向配置的计算 / 搜索服务发送本次序列或结构。"
            : "Allow sending this sequence or structure to the configured compute/search service."}
        </label>
      )}
      <label className="field">
        {zh ? "任务名称（可选）" : "Task name (optional)"}
        <input
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            run.clearError();
          }}
          aria-invalid={!validName}
        />
        {!validName && (
          <span role="alert">
            {zh
              ? "任务名称不能超过 80 个字符。"
              : "Use at most 80 characters for the task name."}
          </span>
        )}
      </label>
    </>
  );
  const review = (
    <HarnessReview
      tool={tool}
      payload={payload}
      assets={sources.assets}
      name={name}
      expert={expert}
      external={needsExternal && external}
      language={language}
    />
  );
  async function submit() {
    setSetupError("");
    try {
      if (!sources.ready)
        throw new Error(
          zh ? "请先核对研究文件。" : "Verify the research files first.",
        );
      const normalized = normalize();
      return await run.submit({
        operation: "harness",
        tool,
        name:
          name.trim() ||
          tools.find((t) => t.id === tool)?.label[zh ? 0 : 1] ||
          (zh ? "蛋白与抗体任务" : "Protein & antibody task"),
        payload: normalized,
        scientific_inputs: sources.references,
        allow_external: external,
      });
    } catch (error) {
      setSetupError(String(error));
    }
  }
  return (
    <Questionnaire
      language={language}
      ready={sources.ready ? readiness.ready : false}
      onCheckEnvironment={readiness.recheck}
      busy={run.busy}
      error={run.error || readiness.error || setupError}
      unavailable={
        zh
          ? "请在安装与组件中完成蛋白与抗体工具的配置。当前输入已保留。"
          : "Configure Harness and this task's compute services in Installation & components. Inputs are retained."
      }
      submitLabel={zh ? "提交计算任务" : "Submit compute task"}
      onSubmit={submit}
      steps={[
        {
          title: zh ? "填写材料" : "Provide inputs",
          actions: mode,
          content: inputs,
          valid:
            sources.ready &&
            (expert
              ? harnessInputsComplete(tool, payload)
              : harnessMaterialsComplete(tool, payload)),
        },
        {
          title: zh ? "选择方案" : "Choose settings",
          content: options,
          valid: harnessInputsComplete(tool, payload),
        },
        {
          title: zh ? "运行设置" : "Run settings",
          content: execution,
          valid: validName && (!needsExternal || external),
        },
        {
          title: zh ? "确认启动" : "Review & start",
          content: review,
          valid: validName && (!needsExternal || external),
        },
      ]}
    />
  );
}
