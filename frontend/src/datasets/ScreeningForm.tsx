import { useEffect, useState } from "react";
import { request } from "../api";
import { GuidedSteps } from "../guided/Questionnaire";
import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import type { Asset } from "../operations/types";
import type { Job, Language } from "../types";
import { DatasetPicker } from "./DatasetPicker";
import { SourcePicker } from "./SourcePicker";
import {
  PocketQuestion,
  ReceptorQuestion,
  usePocketQuestions,
} from "./PocketQuestions";
import { screeningPlan } from "./dataset-model";
import { ExecutionView } from "./ExecutionView";
import { useDatasetRun, type DatasetExecution } from "./useDatasetRun";
import type { DatasetSource, Supplier } from "./types";

export function ScreeningForm({
  language,
  onCreated,
}: {
  language: Language;
  onCreated(job: Job): void;
}) {
  const zh = language === "zh",
    pocket = usePocketQuestions(language),
    run = useDatasetRun(onCreated),
    [library, setLibrary] = useState<Asset | null>(null),
    [indexes, setIndexes] = useState<DatasetSource[]>([]),
    [source, setSource] = useState<"new" | "indexes">("new"),
    [supplier, setSupplier] = useState("custom"),
    [suppliers, setSuppliers] = useState<Supplier[]>([]),
    [profile, setProfile] = useState<"quick" | "focused" | "broad">("quick"),
    [device, setDevice] = useState<"cpu" | "cuda">("cpu"),
    [name, setName] = useState("");
  const retrieval = useTaskReadiness("drugclip.screen"),
    docking = useTaskReadiness("screening.dock"),
    chemistry = useTaskReadiness("library.import");
  useEffect(() => {
    const c = new AbortController();
    void request<Supplier[]>("/datasets/suppliers", { signal: c.signal }).then(
      setSuppliers,
    );
    return () => c.abort();
  }, []);
  const preset = {
    quick: { topK: 100, retain: 25, dock: false },
    focused: { topK: 300, retain: 40, dock: true },
    broad: { topK: 1000, retain: 100, dock: true },
  }[profile];
  const ready =
    retrieval.ready &&
    (!preset.dock || docking.ready) &&
    (source !== "new" || chemistry.ready);
  async function submit() {
    if (!pocket.pocket) return;
    return run.submit(
      screeningPlan({
        name:
          name.trim() ||
          (zh ? "靶点口袋高通量筛选" : "Target-pocket screening"),
        library: source === "new" ? library : null,
        supplier,
        existingIndexes: source === "indexes" ? indexes : [],
        receptorInputs: pocket.inputs,
        pocket: pocket.pocket,
        ...preset,
        device,
      }),
    );
  }
  return (
    <div className="dataset-workspace dataset-screening-form">
      <GuidedSteps<DatasetExecution>
        language={language}
        busy={run.busy}
        error={run.error}
        ready={ready}
        unavailable={
          zh
            ? "请在安装与组件中准备 DrugCLIP、分子处理环境，以及所选方案所需的 GNINA。"
            : "Prepare DrugCLIP, molecular processing and GNINA if docking is selected in Components."
        }
        submitLabel={zh ? "提交筛选" : "Submit screening"}
        onSubmit={submit}
        renderResult={(value) => (
          <ExecutionView
            execution={value}
            language={language}
            onCreated={onCreated}
          />
        )}
        steps={[
          {
            title: zh ? "选择靶点" : "Choose target",
            valid: !!pocket.receptor,
            content: (
              <div className="dataset-question-content">
                <ReceptorQuestion value={pocket} language={language} />
              </div>
            ),
          },
          {
            title: zh ? "选择口袋" : "Choose pocket",
            valid: !!pocket.pocket,
            content: (
              <div className="dataset-question-content">
                <PocketQuestion value={pocket} language={language} />
              </div>
            ),
          },
          {
            title: zh ? "选择分子库" : "Choose library",
            valid: source === "new" ? !!library : indexes.length > 0,
            content: (
              <div className="dataset-question-content">
                <ChoiceCards<"new" | "indexes">
                  label={zh ? "分子库来源" : "Library source"}
                  value={source}
                  onChange={setSource}
                  options={[
                    {
                      value: "new",
                      title: zh ? "导入新分子库" : "Import a new library",
                      note: zh
                        ? "提交后自动准备并建立筛选索引"
                        : "Prepare and index automatically after submission",
                    },
                    {
                      value: "indexes",
                      title: zh ? "历史筛选库" : "Historical screening indexes",
                      note: zh
                        ? "使用已完成编码的库，支持跨库多选"
                        : "Select one or more completed indexes",
                    },
                  ]}
                />
                {source === "new" ? (
                  <>
                    <DatasetPicker
                      kind="library"
                      language={language}
                      value={library}
                      onChange={setLibrary}
                      label={
                        zh
                          ? "供应商或自有分子库"
                          : "Supplier or owned compound library"
                      }
                    />
                    <label className="field">
                      {zh ? "分子来源" : "Compound source"}
                      <select
                        value={supplier}
                        onChange={(e) => setSupplier(e.target.value)}
                      >
                        <option value="custom">
                          {zh ? "自有或其他来源" : "Owned or other source"}
                        </option>
                        {suppliers.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Hint
                      label={zh ? "商业库接入说明" : "Supplier-library help"}
                    >
                      {zh
                        ? "支持全部 35 个供应商目录的官方文件或已有合法文件。库中记录不等于当前有库存；新文件会保留原始货号和化学结构。"
                        : "Import official or legitimately owned files for all 35 supplier-directory entries. Catalogue membership does not establish current stock. Original IDs and chemistry are retained."}
                    </Hint>
                  </>
                ) : (
                  <SourcePicker
                    role="index"
                    language={language}
                    values={indexes}
                    onChange={setIndexes}
                    multiple
                    label={
                      zh ? "选择已准备的筛选库" : "Prepared screening indexes"
                    }
                  />
                )}
              </div>
            ),
          },
          {
            title: zh ? "选择方案并提交" : "Choose plan and submit",
            valid:
              !!pocket.pocket &&
              (source === "new" ? !!library : !!indexes.length),
            content: (
              <div className="dataset-question-content">
                <ChoiceCards<"quick" | "focused" | "broad">
                  label={zh ? "筛选方案" : "Screening plan"}
                  value={profile}
                  onChange={setProfile}
                  options={[
                    {
                      value: "quick",
                      title: zh ? "快速探索" : "Quick exploration",
                      note: zh
                        ? "返回 100 个候选，保留 25 个三维构象"
                        : "100 ranked candidates, 25 retained 3D conformers",
                    },
                    {
                      value: "focused",
                      title: zh ? "筛选＋重点对接" : "Screen and dock",
                      note: zh
                        ? "返回 300 个候选，对接前 40 个"
                        : "300 candidates, dock 40 shortlisted molecules",
                    },
                    {
                      value: "broad",
                      title: zh ? "更广泛探索" : "Broader exploration",
                      note: zh
                        ? "返回 1,000 个候选，对接前 100 个"
                        : "1,000 candidates, dock 100 shortlisted molecules",
                    },
                  ]}
                />
                <div className="dataset-review-strip">
                  <div>
                    <span>{zh ? "检索候选" : "Ranked"}</span>
                    <strong>{preset.topK}</strong>
                  </div>
                  <div>
                    <span>{zh ? "三维候选" : "3D retained"}</span>
                    <strong>{preset.retain}</strong>
                  </div>
                  <div>
                    <span>{zh ? "后续对接" : "Docking"}</span>
                    <strong>
                      {preset.dock
                        ? zh
                          ? "自动执行"
                          : "Automatic"
                        : zh
                          ? "按需选择"
                          : "Optional later"}
                    </strong>
                  </div>
                </div>
                <label className="field">
                  {zh ? "任务名称（可选）" : "Task name (optional)"}
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={60}
                    placeholder={
                      zh
                        ? "例如：BRD4 口袋先导筛选"
                        : "e.g. BRD4 lead screening"
                    }
                  />
                </label>
                <details className="dataset-expert">
                  <summary>{zh ? "专家微调" : "Expert settings"}</summary>
                  <label className="field">
                    {zh ? "计算设备" : "Compute device"}
                    <select
                      value={device}
                      onChange={(e) =>
                        setDevice(e.target.value as "cpu" | "cuda")
                      }
                    >
                      <option value="cpu">CPU</option>
                      <option value="cuda">GPU · CUDA</option>
                    </select>
                  </label>
                </details>
                <p className="dataset-license-note">
                  {zh
                    ? "DrugCLIP 官方模型与输出：仅非商业科研使用。检索分数不代表亲和力。"
                    : "Official DrugCLIP models and outputs: noncommercial research. Retrieval scores are not affinity."}
                </p>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
