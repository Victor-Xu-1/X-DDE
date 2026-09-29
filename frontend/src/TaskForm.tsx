import { useEffect, useRef, useState, type FormEvent } from "react";
import { PlayCircleOutlined } from "@ant-design/icons";
import { defaults, prediction, validate } from "./form-model";
import { translator } from "./i18n";
import {
  taskKinds,
  kindFor,
  componentsFor,
  type TaskKind,
} from "./guided/presets";
import { MolecularInputs } from "./guided/MolecularInputs";
import { ParameterChoices } from "./guided/ParameterChoices";
import type { Component, Language, Parameters, Prediction } from "./types";
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
  const [name, setName] = useState(""),
    [components, setComponents] = useState<Component[]>([
      { kind: "ligand", value: "", count: 1 },
    ]);
  const [parameters, setParameters] = useState<Parameters>({ ...defaults });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [example, setExample] = useState(false);
  const request = useRef({ body: "", key: crypto.randomUUID() });
  const automaticName = useRef("");
  const kind = kindFor(components);
  useEffect(() => {
    if (initialRequest) {
      setName(initialRequest.name);
      setComponents(initialRequest.components.map((x) => ({ ...x })));
      setParameters({ ...initialRequest.parameters });
      setExample(false);
      setError("");
    }
  }, [initialRequest]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const generated =
      taskKinds.find((x) => x.id === kind)!.label[zh ? 0 : 1] +
      " · " +
      new Date().toLocaleString(zh ? "zh-CN" : "en-US");
    if (!automaticName.current) automaticName.current = generated;
    const taskName = name.trim() || automaticName.current;
    const problem = validate(taskName, components);
    if (problem) {
      setError(t(problem));
      return;
    }
    const value = prediction(taskName, components, {
      ...parameters,
      model: components.some((x) => x.kind === "protein")
        ? (parameters.model ?? "standard")
        : "standard",
    });
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
    setName(zh ? "试用 · 咖啡因" : "Try it · Caffeine");
    setComponents([
      { kind: "ligand", value: "Cn1c(=O)c2c(ncn2C)n(C)c1=O", count: 1 },
    ]);
    setParameters({ ...defaults });
    setExample(true);
    setError("");
  }
  return (
    <form className="input-panel panel" onSubmit={submit}>
      <div className="panel-heading">
        <h2>{zh ? "新建预测" : "New prediction"}</h2>
      </div>
      <fieldset disabled={busy}>
        <div
          className="task-kind-choices"
          role="radiogroup"
          aria-label={zh ? "任务类型" : "Task type"}
        >
          {taskKinds.map((item) => (
            <label
              key={item.id}
              className={kind === item.id ? "selected" : ""}
              title={item.note[zh ? 0 : 1]}
            >
              <input
                type="radio"
                name="task-kind"
                checked={kind === item.id}
                onChange={() => {
                  setComponents(componentsFor(item.id as TaskKind, components));
                  setExample(false);
                }}
              />
              {item.label[zh ? 0 : 1]}
            </label>
          ))}
        </div>
        <p className="small muted task-kind-note">
          {taskKinds.find((x) => x.id === kind)!.note[zh ? 0 : 1]}
        </p>
        <button
          type="button"
          className="text-button example-button"
          onClick={exampleInput}
        >
          <PlayCircleOutlined />{" "}
          {zh ? "第一次用？一键填入咖啡因示例" : "First visit? Try caffeine"}
        </button>
        <MolecularInputs
          items={components}
          onChange={(items) => {
            setComponents(items);
            setExample(false);
          }}
          language={language}
        />
        {example && <p className="notice small">{t("demoNote")}</p>}
        <ParameterChoices
          abagAvailable={abagAvailable}
          language={language}
          value={parameters}
          onChange={setParameters}
          hasProtein={components.some((x) => x.kind === "protein")}
        />
        <label className="field task-name">
          {t("name")}{" "}
          <span className="muted small">
            {zh ? "（可选，留空自动命名）" : "(optional; automatic if blank)"}
          </span>
          <input
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("nameHint")}
          />
        </label>
      </fieldset>
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
            ? "完成后自动显示结构和结果。"
            : "Structures and results appear automatically."}
        </p>
      </div>
    </form>
  );
}
