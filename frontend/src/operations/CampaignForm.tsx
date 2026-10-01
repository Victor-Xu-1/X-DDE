import { useCampaignController } from "./useCampaignController";
import { GuidedSteps } from "../guided/Questionnaire";
import type { Language } from "../types";
import { ChainEditor, JsonEditor, MutablePositions } from "./ScientificInputs";
import { type DesignDraft, type Plan } from "./campaign-model";
import { ResultTree } from "./OperationResults";
import { CampaignMonitor } from "./CampaignMonitor";
import { AssetPicker } from "./AssetPicker";

export function CampaignForm({ language }: { language: Language }) {
  const {
    zh,
    draft,
    expert,
    setExpert,
    raw,
    setRaw,
    plan,
    setPlan,
    reviewed,
    setReviewed,
    busy,
    error,
    external,
    setExternal,
    revision,
    config,
    configAsset,
    setConfigAsset,
    importConfig,
    change,
    validate,
    start,
  } = useCampaignController(language);
  const goal = (
    <>
      {" "}
      <div className="segmented">
        <button
          type="button"
          aria-pressed={!expert}
          onClick={() => setExpert(false)}
        >
          {zh ? "简易模式" : "Guided mode"}
        </button>
        <button
          type="button"
          aria-pressed={expert}
          onClick={() => {
            setRaw(config);
            setExpert(true);
          }}
        >
          {zh ? "专家参数" : "Expert parameters"}
        </button>
      </div>
      {!expert && raw && (
        <p className="notice">
          {zh
            ? "当前保留专家配置。要重新使用向导，请点击重置；不会自动覆盖专家参数。"
            : "Your expert configuration is retained. Reset explicitly to use guided settings."}
          <button
            type="button"
            onClick={() => {
              setRaw(null);
              setPlan(null);
              setReviewed(false);
            }}
          >
            {zh ? "重置为向导配置" : "Reset to guided settings"}
          </button>
        </p>
      )}
      <details>
        <summary>
          {zh ? "导入已有设计配置" : "Import an existing design configuration"}
        </summary>
        <AssetPicker
          kind="config"
          value={configAsset}
          onChange={setConfigAsset}
          language={language}
          label="JSON / YAML"
        />
        <button
          type="button"
          disabled={busy || !configAsset}
          onClick={() => void importConfig()}
        >
          {zh ? "导入配置" : "Import configuration"}
        </button>
      </details>
      {!raw && (
        <>
          {" "}
          <label className="field">
            {zh ? "目标名称" : "Target name"}
            <input
              value={draft.targetName}
              required
              maxLength={80}
              onChange={(e) => change({ targetName: e.target.value })}
            />
          </label>
          <ChainEditor
            label={zh ? "抗原 / 目标序列" : "Antigen / target sequences"}
            value={draft.targets}
            onChange={(targets) => change({ targets })}
            language={language}
          />
        </>
      )}
    </>
  );
  const inputs =
    expert || raw ? (
      <>
        <p className="small">
          {zh
            ? "JSON 与原生设计 YAML 使用相同字段，位置从 0 开始。支持设计阶段、路由权重、损失权重、固定残基、初始骨架、终末重折叠及模型微调参数。密钥和执行环境由服务器管理。"
            : "JSON uses the native design YAML fields and zero-based positions. Configure schedules, router/loss weights, fixed residues, initial structure, terminal refolding and model settings. Credentials and execution environments remain server-managed."}
        </p>
        <JsonEditor
          label={zh ? "完整设计配置" : "Full design configuration"}
          value={config}
          onChange={(v) => {
            setRaw(v);
            setPlan(null);
            setReviewed(false);
          }}
        />
        <a
          href="https://github.com/aurekaresearch/OpenDDE-Harness/blob/main/docs/protein-design-yaml.md"
          target="_blank"
          rel="noreferrer"
        >
          {zh ? "官方完整字段说明" : "Official complete parameter reference"}
        </a>
      </>
    ) : (
      <>
        {" "}
        <label className="field">
          {zh ? "抗体形式" : "Antibody format"}
          <select
            value={draft.format}
            onChange={(e) => {
              const format = e.target.value as DesignDraft["format"];
              change({
                format,
                binders:
                  format === "VHVL"
                    ? {
                        B: draft.binders.B ?? "",
                        C: draft.binders.C ?? "",
                      }
                    : { B: draft.binders.B ?? "" },
                cdr: {},
                fixed: {},
              });
            }}
          >
            <option value="VHH">VHH</option>
            <option value="scFv">scFv</option>
            <option value="VHVL">VH / VL</option>
          </select>
        </label>
        <ChainEditor
          label={zh ? "起始抗体骨架" : "Starting antibody scaffold"}
          value={draft.binders}
          onChange={(binders) => change({ binders, cdr: {}, fixed: {} })}
          language={language}
        />
        <p>
          {zh
            ? "选择已有 CDR 的序列位置；没有选择的框架位置保持不变。这里使用从 1 开始的编号。"
            : "Select the sequence positions of your CDRs. Unselected framework positions remain fixed. Positions here start at 1."}
        </p>
        <MutablePositions
          chains={draft.binders}
          value={draft.cdr}
          onChange={(cdr) => change({ cdr })}
          language={language}
        />
        <details>
          <summary>
            {zh
              ? "CDR 中还需保留不变的位置"
              : "Additional fixed positions within CDRs"}
          </summary>
          <MutablePositions
            chains={draft.binders}
            value={draft.fixed}
            onChange={(fixed) => change({ fixed })}
            language={language}
          />
        </details>
      </>
    );
  const settings = (
    <>
      {!raw && (
        <>
          {" "}
          <label className="field">
            {zh ? "计算预算" : "Compute budget"}
            <select
              value={draft.budget}
              onChange={(e) =>
                change({
                  budget: e.target.value as DesignDraft["budget"],
                })
              }
            >
              <option value="small">
                {zh
                  ? "小规模：1 轮 × 2 个提案"
                  : "Small: 1 cycle × 2 proposals"}
              </option>
              <option value="standard">
                {zh
                  ? "标准：3 轮 × 8 个提案"
                  : "Standard: 3 cycles × 8 proposals"}
              </option>
              <option value="extended">
                {zh
                  ? "扩展：10 轮 × 12 个提案"
                  : "Extended: 10 cycles × 12 proposals"}
              </option>
            </select>
          </label>
        </>
      )}{" "}
      <label className="network-choice">
        <input
          type="checkbox"
          checked={external}
          onChange={(e) => setExternal(e.target.checked)}
        />
        {zh
          ? "允许本设计任务调用配置的 LLM 和计算服务；可能产生模型费用并向服务发送研究输入。"
          : "Allow this campaign to use configured LLM and compute services, which may incur costs and transmit research inputs."}
      </label>
    </>
  );
  const review = (
    <>
      <dl className="questionnaire-review">
        <dt>{zh ? "设计对象" : "Design target"}</dt>
        <dd>
          {raw
            ? zh
              ? "已导入的设计配置"
              : "Imported design configuration"
            : draft.targetName}
        </dd>
        <dt>{zh ? "抗体形式" : "Antibody format"}</dt>
        <dd>
          {raw
            ? zh
              ? "沿用原配置"
              : "Use native configuration"
            : draft.format}
        </dd>
        <dt>{zh ? "启动检查" : "Launch validation"}</dt>
        <dd>
          {plan?.state === "validated"
            ? zh
              ? "任务摘要已生成，可核对后启动"
              : "Server plan ready for review"
            : zh
              ? "先检查配置和任务摘要"
              : "Validate configuration and review plan first"}
        </dd>
      </dl>
      <button
        type="button"
        className="secondary-button"
        disabled={busy || !external}
        onClick={() => void validate()}
      >
        {zh ? "检查配置并生成任务摘要" : "Validate and review campaign"}
      </button>
      {plan && (
        <>
          <details>
            <summary>
              {zh ? "查看服务器任务摘要" : "Inspect server plan summary"}
            </summary>
            <ResultTree value={plan.summary} zh={zh} />
          </details>
          {plan.state === "validated" && (
            <label>
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              {zh
                ? "已确认目标、可变位置和计算预算。"
                : "I have reviewed the target, mutable positions and compute budget."}
            </label>
          )}
        </>
      )}
    </>
  );
  const targetValid =
    Boolean(raw) ||
    Boolean(
      draft.targetName.trim() &&
      Object.values(draft.targets).length &&
      Object.values(draft.targets).every((v) => v.trim()),
    );
  const binderValid =
    Boolean(raw) ||
    (Object.values(draft.binders).length > 0 &&
      Object.values(draft.binders).every((v) => Boolean(v.trim())) &&
      Object.values(draft.cdr).some((v) => v.length > 0));
  return (
    <div>
      <GuidedSteps<Plan>
        language={language}
        busy={busy}
        error={error}
        ready={Boolean(
          plan &&
          !plan.task_id &&
          (plan.state === "uncertain" ||
            (plan.state === "validated" && reviewed && external)),
        )}
        unavailable={
          zh
            ? "请先检查服务器配置、核对任务摘要，再确认启动。"
            : "Validate server configuration and confirm the plan before launch."
        }
        submitLabel={
          plan?.state === "uncertain"
            ? zh
              ? "核对已派发任务（不重复启动）"
              : "Reconcile dispatch (no duplicate launch)"
            : zh
              ? "启动设计"
              : "Start design"
        }
        onSubmit={start}
        resultTitle={zh ? "跟踪设计" : "Track design"}
        renderResult={(value) => (
          <p role="status">
            {zh
              ? "设计任务已派发。下方可查看实际运行状态和结果。"
              : "Campaign dispatched. Inspect its actual progress and results below."}{" "}
            {value.task_id}
          </p>
        )}
        steps={[
          {
            title: zh ? "选择目标" : "Choose target",
            content: goal,
            valid: targetValid,
          },
          {
            title: zh ? "填写抗体" : "Provide antibody",
            content: inputs,
            valid: binderValid,
          },
          {
            title: zh ? "选择方案" : "Choose settings",
            content: settings,
            valid: external,
          },
          {
            title: zh ? "确认启动" : "Review & start",
            content: review,
            valid: external,
          },
        ]}
      />
      <details open={Boolean(plan?.task_id)}>
        <summary>
          {zh ? "已保存设计任务与运行记录" : "Saved campaigns and run history"}
        </summary>{" "}
        <CampaignMonitor
          language={language}
          revision={revision}
          onRestore={(p) => {
            if (p.config) setRaw(p.config);
            setExpert(true);
            setPlan(p);
            setReviewed(false);
          }}
        />
      </details>
    </div>
  );
}
