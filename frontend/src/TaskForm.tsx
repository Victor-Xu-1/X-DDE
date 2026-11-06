import { useRef, useState } from "react";
import { ExampleContext } from "./examples/context";
import type { PreparedExample } from "./examples/types";
import { ExampleActions } from "./examples/ExampleActions";
import { examplePrediction } from "./examples/prediction";
import { prediction, validate } from "./form-model";
import { translator } from "./i18n";
import { taskKinds, completeWorkflow, type TaskKind } from "./guided/presets";
import { WorkflowChoices } from "./guided/WorkflowChoices";
import { MolecularInputs } from "./guided/MolecularInputs";
import { ParameterChoices } from "./guided/ParameterChoices";
import { Hint } from "./guided/Hint";
import { Questionnaire } from "./guided/Questionnaire";
import type { Job, Language, Prediction } from "./types";
import { ExpertParameters } from "./operations/ExpertParameters";
import { CovalentEditor } from "./operations/CovalentEditor";
import { PredictionSetup } from "./presentation/PredictionSetup";
import { validFeaturePolicy } from "./presentation/prediction-feature-policy";
import { OpenDdeJobReview } from "./operations/OpenDdeJobReview";
import { PredictionDraftBoundary } from "./presentation/PredictionDraftBoundary";
import { SharedPredictionDraftControls } from "./presentation/SharedPredictionDraftControls";
import {
  openDdeDraftAdapter,
  type OpenDdeDraft,
} from "./operations/opendde-draft";
import { useOpenDdeEditor } from "./operations/useOpenDdeEditor";
import { validIntegerTexts } from "./operations/integer-list-model";
interface Props {
  language: Language;
  ready: boolean;
  abagAvailable?: boolean;
  initialRequest?: Prediction | null;
  projectId?: string | null;
  onCheckEnvironment?(): void;
  onPreviewChange?(value: boolean): void;
  onSubmit(value: Prediction, key: string): Promise<Job>;
}
export function TaskForm(props: Props) {
  return (
    <PredictionDraftBoundary<OpenDdeDraft>
      key={JSON.stringify(props.initialRequest ?? null)}
    >
      {({ initialDraft, edition, onResume }) => (
        <TaskFormEditor
          {...props}
          key={edition}
          initialDraft={initialDraft}
          onResumeDraft={onResume}
        />
      )}
    </PredictionDraftBoundary>
  );
}
function TaskFormEditor({
  language,
  ready,
  initialRequest,
  projectId = null,
  onCheckEnvironment,
  onSubmit,
  abagAvailable = false,
  onPreviewChange,
  initialDraft,
  onResumeDraft,
}: Props & {
  initialDraft: OpenDdeDraft | null;
  onResumeDraft(value: OpenDdeDraft): void;
}) {
  const t = translator(language),
    zh = language === "zh";
  const [example, setExample] = useState<PreparedExample | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const editor = useOpenDdeEditor(initialDraft, initialRequest);
  const {
    name,
    kind,
    expert,
    components,
    parameters,
    bonds,
    input_references: inputReferences,
    integer_text: integerText,
  } = editor.state;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef({ body: "", key: crypto.randomUUID() });
  const automaticName = useRef("");
  const [openedAt] = useState(() => new Date());
  function chooseKind(next: TaskKind) {
    editor.chooseKind(next);
    setError("");
    automaticName.current = "";
  }
  const model = components.some((x) => x.kind === "protein")
    ? (parameters.model ?? "standard")
    : "standard";
  function currentPrediction(): Prediction {
    const taskName =
      name.trim() ||
      automaticName.current ||
      taskKinds.find((x) => x.id === kind)!.label[zh ? 0 : 1] +
        " · " +
        openedAt.toLocaleString(zh ? "zh-CN" : "en-US");
    const value = prediction(taskName, components, {
      ...parameters,
      model,
    });
    value.operation = "predict";
    value.project_id = projectId;
    value.covalent_bonds = bonds;
    value.scientific_inputs = inputReferences.filter((reference) =>
      components.some(
        (component) =>
          component.ligand_file === reference.asset_id ||
          component.source_sequence === reference.asset_id,
      ),
    );
    return value;
  }
  async function submit(value: Prediction) {
    if (!name.trim()) automaticName.current = value.name;
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
        onClick={() => editor.patch({ expert: false })}
      >
        {zh ? "简易模式" : "Guided mode"}
      </button>
      <button
        type="button"
        aria-pressed={expert}
        className={expert ? "selected" : ""}
        onClick={() => editor.patch({ expert: true })}
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
        onChange={editor.changeComponents}
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
          onChange={(value) => editor.patch({ bonds: value })}
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
        onChange={editor.changeParameters}
        hasProtein={components.some((x) => x.kind === "protein")}
        expert={expert}
      />
      <ExpertParameters
        contextKey={JSON.stringify(
          components.map((item) => [
            item.kind,
            item.value,
            item.count,
            item.chain_ids,
            item.modifications,
            item.ligand_file,
          ]),
        )}
        value={parameters}
        onChange={editor.changeParameters}
        language={language}
        expert={expert}
        integerText={integerText}
        onIntegerTextChange={editor.changeIntegerText}
      />
      <p className="small model-summary">
        {zh ? "本次模型：" : "Model: "}
        {model === "abag" ? "OpenDDE ABAG" : "OpenDDE"} ·{" "}
        {zh ? "服务端计算" : "Server computation"}
      </p>
      {!validIntegerTexts(parameters, integerText) && (
        <p className="notice" role="alert">
          {zh
            ? "请在专家参数中检查随机种子和 GPU 编号；未完成的输入已保留。"
            : "Check seeds and GPU indices in expert settings. Your unfinished input is retained."}
          {!expert && (
            <button
              type="button"
              onClick={() => editor.patch({ expert: true })}
            >
              {zh ? "显示专家参数" : "Show expert settings"}
            </button>
          )}
        </p>
      )}
    </>
  );
  const inputValid =
    !validate("Structure prediction", components) &&
    (expert || completeWorkflow(kind, components));
  const modelReady =
    model !== "abag" || Boolean(parameters.checkpoint_id) || abagAvailable;
  const settingsValid =
    validFeaturePolicy(parameters) &&
    validIntegerTexts(parameters, integerText);
  const unavailable = zh
    ? "本任务所需的结构预测环境或模型尚未就绪。请在安装与组件中配置；已填信息保留。"
    : "Configure this task's prediction environment and model in Installation & components. Inputs are retained.";
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
        {model === "abag" ? "OpenDDE ABAG" : "OpenDDE"} · {parameters.samples}
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
        onPreviewChange={(value) => {
          setPreviewing(value);
          onPreviewChange?.(value);
        }}
        onClear={() => {
          setExample(null);
          editor.clear();
          setError("");
          automaticName.current = "";
        }}
        onLoad={(prepared) => {
          setExample(prepared);
          const value = examplePrediction(prepared);
          editor.load(value);
          automaticName.current = "";
          setError("");
        }}
      />
      <div hidden={previewing}>
        <ExampleContext.Provider value={example}>
          <PredictionSetup
            language={language}
            components={components}
            model={model === "abag" ? "OpenDDE ABAG" : "OpenDDE"}
            seeds={[parameters.seed, ...(parameters.additional_seeds ?? [])]}
            samples={parameters.samples}
            valid={inputValid}
            draftControls={
              <SharedPredictionDraftControls
                adapter={openDdeDraftAdapter}
                state={editor.snapshot}
                initial={initialDraft}
                language={language}
                busy={busy}
                onName={(value) => editor.patch({ name: value })}
                onResume={onResumeDraft}
              />
            }
          >
            <Questionnaire
              key={editor.revision}
              language={language}
              ready={ready && modelReady}
              busy={busy}
              error={error}
              unavailable={unavailable}
              onCheckEnvironment={onCheckEnvironment}
              submitLabel={zh ? "预览任务" : "Preview job"}
              renderReview={({ confirm, dismiss }) => (
                <OpenDdeJobReview
                  input={currentPrediction()}
                  language={language}
                  ready={ready && modelReady}
                  unavailable={unavailable}
                  recheck={onCheckEnvironment}
                  busy={busy}
                  error={error}
                  confirm={confirm}
                  onClose={dismiss}
                  submit={submit}
                />
              )}
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
                  valid: settingsValid,
                },
                {
                  title: zh ? "确认启动" : "Review & start",
                  content: review,
                  valid: inputValid && settingsValid,
                },
              ]}
            />
          </PredictionSetup>
        </ExampleContext.Provider>
      </div>
    </>
  );
}
