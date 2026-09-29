import { useEffect, useState } from "react";
import { request } from "../api";
import type { Job, Language } from "../types";
import { harnessDefaults, harnessFields } from "./harness-fields";
import { HarnessField } from "./HarnessField";
import { FoldInputs } from "./FoldInputs";
import { JsonEditor } from "./ScientificInputs";
import { useTaskSubmit } from "./useTaskSubmit";
import { canGuide } from "./guided-contract";

export function HarnessForm({
  tool,
  language,
  onCreated,
}: {
  tool: string;
  language: Language;
  onCreated(j: Job): void;
}) {
  const zh = language === "zh",
    [payload, setPayload] = useState<Record<string, unknown>>(() =>
      structuredClone(harnessDefaults[tool]),
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
      .then(setReadiness)
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
  return (
    <form
      className="tool-form"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          void run.submit({
            operation: "harness",
            tool,
            name: name.trim() || `Harness · ${tool}`,
            payload: normalize(),
            allow_external: external,
          });
        } catch (error) {
          setSetupError(String(error));
        }
      }}
    >
      <fieldset disabled={run.busy}>
        {readiness &&
          (!readiness.configured ||
            (tool !== "compare" && !readiness.compute_configured)) && (
            <p className="notice">
              {zh
                ? "服务器尚未配置 Harness。可以先准备输入，配置完成后再提交。所需设置："
                : "Harness is not configured on the server. Prepare inputs now, then submit after setup. Required settings: "}
              {readiness.required_settings.join(", ")}
            </p>
          )}
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
        {!expert ? (
          tool === "fold" ? (
            <FoldInputs
              value={payload}
              onChange={setPayload}
              language={language}
            />
          ) : (
            harnessFields[tool]?.map((field) => (
              <HarnessField
                key={field.key}
                field={field}
                tool={tool}
                payload={payload}
                onChange={(v) => setPayload({ ...payload, [field.key]: v })}
                language={language}
              />
            ))
          )
        ) : (
          <>
            <p className="notice">
              {zh
                ? "原生参数中的残基位置从 0 开始。文件字段使用 asset:上传文件ID；连接地址、密钥和执行路径由服务器管理。"
                : "Native residue indices start at 0. File fields use asset:uploaded-file-ID; endpoints, credentials and executable paths are server-managed."}
            </p>
            <JsonEditor
              value={payload}
              onChange={setPayload}
              label={
                zh ? "完整原生科学参数" : "Full native scientific parameters"
              }
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
        {(run.error || setupError) && (
          <p role="alert" className="error-box">
            {run.error || setupError}
          </p>
        )}
        <button
          className="primary-button"
          disabled={
            run.busy ||
            (needsExternal && !external) ||
            !readiness?.configured ||
            (tool !== "compare" && !readiness?.compute_configured)
          }
        >
          {run.busy
            ? zh
              ? "正在提交…"
              : "Submitting…"
            : zh
              ? "提交计算任务"
              : "Submit compute task"}
        </button>
      </fieldset>
    </form>
  );
}
