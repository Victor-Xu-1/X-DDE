import { useEffect, useRef, useState, type FormEvent } from "react";
import { PlayCircleOutlined } from "@ant-design/icons";
import { defaults, prediction, validate } from "./form-model";
import { translator } from "./i18n";
import {
  taskKinds,
  kindFor,
  componentsFor,
  completeWorkflow,
  type TaskKind,
} from "./guided/presets";
import { WorkflowChoices } from "./guided/WorkflowChoices";
import { MolecularInputs } from "./guided/MolecularInputs";
import { ParameterChoices } from "./guided/ParameterChoices";
import { Hint } from "./guided/Hint";
import type { Component, Language, Parameters, Prediction } from "./types";
import { ExpertParameters } from "./operations/ExpertParameters";
import { CovalentEditor } from "./operations/CovalentEditor";
import type { CovalentBond } from "./operations/types";
interface Props {
  language: Language;
  ready: boolean;
  abagAvailable?: boolean;
  initialRequest?: Prediction | null;
  onSubmit(value: Prediction, key: string): Promise<void>;
}
export function TaskForm({
  language,
  ready,
  initialRequest,
  onSubmit,
  abagAvailable = false,
}: Props) {
  const t = translator(language),
    zh = language === "zh";
  const [kind, setKind] = useState<TaskKind>("complex");
  const [expert, setExpert] = useState(false);
  const [name, setName] = useState(""),
    [components, setComponents] = useState<Component[]>(
      componentsFor("complex", []),
    );
  const [parameters, setParameters] = useState<Parameters>({
    ...defaults,
    model: "standard",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [example, setExample] = useState(false);
  const drafts = useRef<Partial<Record<TaskKind, Component[]>>>({});
  const request = useRef({ body: "", key: crypto.randomUUID() });
  const automaticName = useRef("");
  const [bonds, setBonds] = useState<CovalentBond[]>([]);
  useEffect(() => {
    if (!initialRequest) return;
    setName(initialRequest.name);
    setKind(
      kindFor(initialRequest.components, initialRequest.parameters.model),
    );
    setComponents(initialRequest.components.map((x) => ({ ...x })));
    drafts.current = {
      [kindFor(initialRequest.components, initialRequest.parameters.model)]:
        initialRequest.components.map((x) => ({ ...x })),
    };
    automaticName.current = "";
    setParameters({ ...initialRequest.parameters });
    setBonds(initialRequest.covalent_bonds ?? []);
    setExample(false);
    setError("");
  }, [initialRequest]);
  function chooseKind(next: TaskKind) {
    drafts.current[kind] = components;
    setComponents(drafts.current[next] ?? componentsFor(next, components));
    setKind(next);
    setBonds([]);
    setParameters((p) => ({
      ...p,
      model: next === "antibody" ? "abag" : "standard",
    }));
    setExample(false);
    setError("");
    automaticName.current = "";
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!automaticName.current)
      automaticName.current =
        taskKinds.find((x) => x.id === kind)!.label[zh ? 0 : 1] +
        " · " +
        new Date().toLocaleString(zh ? "zh-CN" : "en-US");
    const taskName = name.trim() || automaticName.current;
    const problem = validate(taskName, components);
    if (problem) {
      setError(t(problem));
      return;
    }
    if (!expert && !completeWorkflow(kind, components)) {
      setError(
        zh
          ? "当前组分不完整，请补齐所选任务需要的输入，或切换到专家模式自由组合。"
          : "Complete the inputs required for this task, or use Expert mode for a custom assembly.",
      );
      return;
    }
    const value = prediction(taskName, components, {
      ...parameters,
      model: components.some((x) => x.kind === "protein")
        ? (parameters.model ?? "standard")
        : "standard",
    });
    if (
      value.parameters.model === "abag" &&
      !value.parameters.checkpoint_id &&
      !abagAvailable
    ) {
      setError(
        zh
          ? "ABAG 模型未就绪，请到运行状态检查权重。"
          : "ABAG is unavailable. Check the checkpoint in Runtime status.",
      );
      return;
    }
    value.covalent_bonds = bonds;
    const body = JSON.stringify(value);
    if (request.current.body !== body)
      request.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await onSubmit(value, request.current.key);
      request.current = { body: "", key: crypto.randomUUID() };
      automaticName.current = "";
    } catch (error) {
      setError(error instanceof Error ? error.message : t("error"));
    } finally {
      setBusy(false);
    }
  }
  function exampleInput() {
    drafts.current[kind] = components;
    setName(zh ? "试用 · 咖啡因" : "Try it · Caffeine");
    setKind("ligand");
    setComponents([
      { kind: "ligand", value: "Cn1c(=O)c2c(ncn2C)n(C)c1=O", count: 1 },
    ]);
    setParameters({ ...defaults, steps: 50, cycles: 4, model: "standard" });
    setExample(true);
    setError("");
  }
  return (
    <form className="input-panel panel" onSubmit={submit}>
      <fieldset disabled={busy}>
        <div className="form-mode-row">
          <span>{zh ? "新建结构预测" : "New structure prediction"}</span>
          <div
            className="segmented"
            role="group"
            aria-label={zh ? "操作模式" : "Interaction mode"}
          >
            <button
              type="button"
              aria-pressed={!expert}
              className={!expert ? "selected" : ""}
              onClick={() => setExpert(false)}
            >
              {zh ? "简易模式" : "Guided mode"}
            </button>
            <button
              type="button"
              aria-pressed={expert}
              className={expert ? "selected" : ""}
              onClick={() => setExpert(true)}
            >
              {zh ? "专家微调" : "Expert mode"}
            </button>
            <Hint label={zh ? "操作模式说明" : "Mode help"}>
              {zh
                ? "简易模式使用预设，专家模式可自由增加组分、调整拷贝数和计算参数。切换模式保留所有输入和参数；选择运行方案才会重设数值。"
                : "Guided mode uses presets. Expert mode adds arbitrary components, copy counts and numeric parameters. Switching modes preserves your inputs and settings; selecting a preset resets its numeric values."}
            </Hint>
          </div>
        </div>
        <WorkflowChoices
          value={kind}
          onChange={chooseKind}
          language={language}
          abagAvailable={abagAvailable}
        />
        <div className="task-setup-grid">
          <div>
            <MolecularInputs
              items={components}
              onChange={(items) => {
                setComponents(items);
                setExample(false);
              }}
              language={language}
              expert={expert}
              workflow={kind}
              features={parameters.feature_mode === "uploaded"}
            />
            <button
              type="button"
              className="text-button example-button"
              onClick={exampleInput}
            >
              <PlayCircleOutlined />{" "}
              {zh
                ? "第一次用？一键填入咖啡因示例"
                : "First visit? Try caffeine"}
            </button>
            {example && <p className="notice small">{t("demoNote")}</p>}
            {expert && (
              <CovalentEditor
                components={components}
                parameters={parameters}
                value={bonds}
                onChange={setBonds}
                language={language}
              />
            )}
          </div>
          <div className="run-settings">
            <ParameterChoices
              abagAvailable={abagAvailable}
              language={language}
              value={parameters}
              onChange={setParameters}
              hasProtein={components.some((x) => x.kind === "protein")}
              expert={expert}
            />
            <ExpertParameters
              value={parameters}
              onChange={setParameters}
              language={language}
              expert={expert}
            />
            <p className="small model-summary">
              {zh ? "本次模型：" : "Model: "}
              {parameters.model === "abag" ? "OpenDDE ABAG" : "OpenDDE"} ·{" "}
              {zh ? "本机计算" : "Local computation"}
            </p>
            <label className="field task-name">
              {t("name")}{" "}
              <span className="muted small">
                {zh
                  ? "（可选，留空自动命名）"
                  : "(optional; automatic if blank)"}
              </span>
              <input
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("nameHint")}
              />
            </label>
            <div className="submit-area">
              {!ready && (
                <p className="notice small">
                  {zh
                    ? "正在等待本机引擎。可先填写输入，或到“运行状态”查看原因。"
                    : "Waiting for the local engine. Prepare inputs or check Runtime status."}
                </p>
              )}
              {error && (
                <div role="alert" className="error-box">
                  {error}
                </div>
              )}
              <button
                className="primary-button"
                type="submit"
                aria-label={
                  busy ? t("submitting") : zh ? "开始预测" : "Run prediction"
                }
                disabled={busy || !ready}
              >
                {busy ? t("submitting") : zh ? "开始预测" : "Run prediction"}{" "}
                <PlayCircleOutlined />
              </button>
              <p className="muted small">
                {zh
                  ? "完成后自动显示结构与结果；页面关闭后任务仍会继续。"
                  : "Results appear automatically. Tasks continue after this page closes."}
              </p>
            </div>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
