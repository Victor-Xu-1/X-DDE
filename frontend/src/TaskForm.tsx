import { useEffect, useRef, useState } from "react";
import { ExampleContext } from "./examples/context";
import type { PreparedExample } from "./examples/types";
import { ExampleActions } from "./examples/ExampleActions";
import { examplePrediction } from "./examples/prediction";
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
import { Questionnaire } from "./guided/Questionnaire";
import type { Component, Job, Language, Parameters, Prediction } from "./types";
import { ExpertParameters } from "./operations/ExpertParameters";
import { CovalentEditor } from "./operations/CovalentEditor";
import type { CovalentBond } from "./operations/types";
import type { MoleculeRef } from "./research/types";
interface Props {
  language: Language;
  ready: boolean;
  abagAvailable?: boolean;
  initialRequest?: Prediction | null;
  onSubmit(value: Prediction, key: string): Promise<Job>;
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
  const [example, setExample] = useState<PreparedExample | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [templateRevision, setTemplateRevision] = useState(0);
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
    [error, setError] = useState("");
  const [inputReferences, setInputReferences] = useState<MoleculeRef[]>([]);
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
    setInputReferences(initialRequest.scientific_inputs ?? []);
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
    setError("");
    automaticName.current = "";
  }
  async function submit() {
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
    value.scientific_inputs = inputReferences.filter((reference) =>
      components.some(
        (component) =>
          component.ligand_file === reference.asset_id ||
          component.source_sequence === reference.asset_id,
      ),
    );
    const body = JSON.stringify(value);
    if (request.current.body !== body)
      request.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const result = await onSubmit(value, request.current.key);
      request.current = { body: "", key: crypto.randomUUID() };
      automaticName.current = "";
      return result;
    } catch (error) {
      setError(error instanceof Error ? error.message : t("error"));
    } finally {
      setBusy(false);
    }
  }
  const goalTools = (
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
  );
  const goal = (
    <WorkflowChoices
      value={kind}
      onChange={chooseKind}
      language={language}
      abagAvailable={abagAvailable}
    />
  );
  const inputs = (
    <>
      {" "}
      <MolecularInputs
        showHeading={false}
        items={components}
        onChange={(items) => {
          setComponents(items);
        }}
        language={language}
        expert={expert}
        workflow={kind}
        features={parameters.feature_mode === "uploaded"}
      />
      {expert && (
        <CovalentEditor
          components={components}
          parameters={parameters}
          value={bonds}
          onChange={setBonds}
          language={language}
        />
      )}
    </>
  );
  const settings = (
    <>
      {" "}
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
        {zh ? "服务端计算" : "Server computation"}
      </p>
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
    </>
  );
  const inputValid =
    !validate("Structure prediction", components) &&
    (expert || completeWorkflow(kind, components));
  const modelReady =
    parameters.model !== "abag" ||
    Boolean(parameters.checkpoint_id) ||
    abagAvailable;
  const review = (
    <dl className="questionnaire-review">
      <dt>{zh ? "研究任务" : "Research task"}</dt>
      <dd>{taskKinds.find((x) => x.id === kind)?.label[zh ? 0 : 1]}</dd>
      <dt>{zh ? "输入" : "Inputs"}</dt>
      <dd>
        {components.length} {zh ? "个已填组分" : "provided components"}
      </dd>
      <dt>{zh ? "模型与构象数" : "Model and samples"}</dt>
      <dd>
        {parameters.model === "abag" ? "OpenDDE ABAG" : "OpenDDE"} ·{" "}
        {parameters.samples}
      </dd>
      <dt>{zh ? "任务名称" : "Task name"}</dt>
      <dd>{name.trim() || (zh ? "自动命名" : "Automatic")}</dd>
    </dl>
  );
  return (
    <>
      <ExampleActions
        capability="predict"
        language={language}
        onPreviewChange={setPreviewing}
        onClear={() => {
          setExample(null);
          setName("");
          setKind("complex");
          setExpert(false);
          setComponents(componentsFor("complex", []));
          setParameters({ ...defaults, model: "standard" });
          setBonds([]);
          setInputReferences([]);
          setError("");
          drafts.current = {};
          automaticName.current = "";
          setTemplateRevision((value) => value + 1);
        }}
        onLoad={(prepared) => {
          setExample(prepared);
          setTemplateRevision((value) => value + 1);
          const value = examplePrediction(prepared);
          setName(value.name);
          setKind(kindFor(value.components, value.parameters.model));
          setComponents(value.components);
          setParameters(value.parameters);
          setBonds([]);
          setInputReferences(value.scientific_inputs ?? []);
          setError("");
        }}
      />
      <div hidden={previewing}>
        <ExampleContext.Provider value={example}>
          <Questionnaire
            key={templateRevision}
            language={language}
            ready={ready && modelReady}
            busy={busy}
            error={error}
            unavailable={
              zh
                ? "本任务所需的结构预测环境或模型尚未就绪。请在安装与组件中配置；已填信息保留。"
                : "Configure this task's prediction environment and model in Installation & components. Inputs are retained."
            }
            submitLabel={zh ? "开始预测" : "Run prediction"}
            onSubmit={submit}
            steps={[
              {
                title: zh
                  ? "你想预测什么？"
                  : "What would you like to predict?",
                actions: goalTools,
                content: goal,
                valid: true,
              },
              {
                title: zh ? "填写材料" : "Provide inputs",
                content: inputs,
                valid: inputValid,
              },
              {
                title: zh ? "选择方案" : "Choose settings",
                content: settings,
                valid: true,
              },
              {
                title: zh ? "确认启动" : "Review & start",
                content: review,
                valid: inputValid,
              },
            ]}
          />
        </ExampleContext.Provider>
      </div>
    </>
  );
}
