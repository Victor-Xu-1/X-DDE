import { useEffect, useState } from "react";
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
import { canGuide } from "./guided-contract";
import { Questionnaire } from "../guided/Questionnaire";
import { harnessInputsComplete } from "./harness-questionnaire-model";

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
    [readiness, setReadiness] = useState<{
      configured: boolean;
      compute_configured: boolean;
      required_settings: string[];
    } | null>(null),
    [setupError, setSetupError] = useState(""),
    [schema, setSchema] = useState<unknown>(null),
    [name, setName] = useState(""),
    run = useTaskSubmit(onCreated);
  const needsExternal = [
    "target-msa",
    "protrek-sequence",
    "protrek-structure",
    "fold",
  ].includes(tool);
  useEffect(() => {
    const c = new AbortController();
    void request<typeof readiness>("/harness/readiness", { signal: c.signal })
      .then((value) => {
        if (!c.signal.aborted) setReadiness(value);
      })
      .catch((e) => {
        if (!c.signal.aborted) setSetupError(String(e));
      });
    return () => c.abort();
  }, []);
  async function loadSchema() {
    try {
      const data = await request<{ tools: Record<string, unknown> }>(
        "/harness/schemas",
      );
      setSchema(data.tools[tool]);
    } catch (e) {
      setSetupError(String(e));
    }
  }
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
  const renderFields = (required: boolean) =>
    harnessFields[tool]
      ?.filter((field) => Boolean(field.required) === required)
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
      <div className="segmented">
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
  const inputs = expert ? (
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
      <button type="button" onClick={() => void loadSchema()}>
        {zh
          ? "查看当前 Harness 的参数定义"
          : "Inspect the installed Harness schema"}
      </button>
      {schema != null && (
        <details>
          <summary>
            {zh ? "原生字段与默认值" : "Native fields and defaults"}
          </summary>
          <pre>{JSON.stringify(schema, null, 2)}</pre>
        </details>
      )}
    </>
  ) : tool === "fold" ? (
    <FoldInputs value={payload} onChange={setPayload} language={language} />
  ) : (
    <>{renderFields(true)}</>
  );
  const options = (
    <>
      {!expert && (
        <>
          <p className="field-help">
            {zh
              ? "默认方案已设置。需要调整数量或其他选项时展开下方设置。"
              : "Defaults are configured. Expand optional settings to change counts or other options."}
          </p>
          <details>
            <summary>
              {zh ? "调整方案（可选）" : "Adjust settings (optional)"}
            </summary>
            {renderFields(false)}
          </details>
        </>
      )}
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
          onChange={(e) => setName(e.target.value)}
        />
      </label>
    </>
  );
  const review = (
    <dl className="questionnaire-review">
      <dt>{zh ? "输入" : "Input"}</dt>
      <dd>
        {zh
          ? "使用当前填写的文件、序列与位置"
          : "Use the entered files, sequences and positions"}
      </dd>
      <dt>{zh ? "参数模式" : "Parameter mode"}</dt>
      <dd>
        {expert
          ? zh
            ? "专家原生参数"
            : "Expert native parameters"
          : zh
            ? "推荐方案及已选可选设置"
            : "Recommended settings and chosen adjustments"}
      </dd>
      <dt>{zh ? "服务调用" : "Service calls"}</dt>
      <dd>
        {needsExternal
          ? zh
            ? "已确认使用配置的外部服务"
            : "Configured external services approved"
          : zh
            ? "由服务器管理的计算环境"
            : "Server-managed compute environment"}
      </dd>
    </dl>
  );
  async function submit() {
    setSetupError("");
    try {
      const normalized = normalize();
      return await run.submit({
        operation: "harness",
        tool,
        name: name.trim() || `Harness · ${tool}`,
        payload: normalized,
        scientific_inputs: exampleHarnessInputs(tool, normalized, example),
        allow_external: external,
      });
    } catch (error) {
      setSetupError(String(error));
    }
  }
  const ready = Boolean(
    readiness?.configured &&
    (tool === "compare" || readiness.compute_configured),
  );
  return (
    <Questionnaire
      language={language}
      ready={ready}
      busy={run.busy}
      error={run.error || setupError}
      unavailable={
        zh
          ? "请在安装与组件中配置 Harness 及本任务所需的计算服务。当前输入已保留。"
          : "Configure Harness and this task's compute services in Installation & components. Inputs are retained."
      }
      submitLabel={zh ? "提交计算任务" : "Submit compute task"}
      onSubmit={submit}
      steps={[
        { title: zh ? "选择模式" : "Choose mode", content: mode, valid: true },
        {
          title: zh ? "填写材料" : "Provide inputs",
          content: inputs,
          valid: harnessInputsComplete(tool, payload),
        },
        {
          title: zh ? "选择方案" : "Choose settings",
          content: options,
          valid: !needsExternal || external,
        },
        {
          title: zh ? "确认启动" : "Review & start",
          content: review,
          valid: !needsExternal || external,
        },
      ]}
    />
  );
}
