import { useEffect, useState } from "react";
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
import type { DatasetSource } from "./types";
import { SupplierPicker } from "./SupplierPicker";
import { LibraryFields } from "./LibraryFields";
import { useTablePreview } from "./useTablePreview";
import { dataDefaults } from "./catalog";
import { useDatasetExample } from "./useDatasetExample";
import { ShortlistChoices, type ShortlistSettings } from "./ShortlistChoices";

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
    [idColumn, setIdColumn] = useState("ID"),
    [smilesColumn, setSmilesColumn] = useState("SMILES"),
    [radius, setRadius] = useState<number>(dataDefaults.drugclip.pocket_radius),
    [batch, setBatch] = useState<number>(dataDefaults.drugclip.batch_size),
    [altloc, setAltloc] = useState<"highest_occupancy" | "reject" | "A" | "B">(
      "highest_occupancy",
    ),
    [profile, setProfile] = useState<"quick" | "focused" | "broad">("quick"),
    [device, setDevice] = useState<"cpu" | "cuda">("cpu"),
    [name, setName] = useState("");
  const [score, setScore] = useState<"fold_zscore" | "mean_cosine">(
    "fold_zscore",
  );
  const [shortlist, setShortlist] = useState<ShortlistSettings>({
    shortlist: "ranked",
    candidate_policy: "all",
    structural_alerts: "off",
  });
  const retrieval = useTaskReadiness("drugclip.screen"),
    docking = useTaskReadiness("screening.dock"),
    chemistry = useTaskReadiness("library.import");
  const { preview, error } = useTablePreview(source === "new" ? library : null);
  const [templateError, setTemplateError] = useState("");
  const example = useDatasetExample(setTemplateError, language);
  useEffect(() => {
    if (!example) return;
    setSource("indexes");
    setIndexes(example.sources);
    setName(example.task.name);
    setAltloc(
      (example.task.payload.alternate_locations as typeof altloc) ??
        "highest_occupancy",
    );
    setRadius(Number(example.task.payload.pocket_radius ?? 6));
    setScore(
      example.task.payload.score === "mean_cosine"
        ? "mean_cosine"
        : "fold_zscore",
    );
  }, [example]);
  useEffect(() => {
    if (!preview?.columns.length) return;
    setIdColumn(
      preview.columns.find((name) =>
        /^(id|compound.?id|catalog.?id|chembl.?id)$/i.test(name),
      ) ?? preview.columns[0],
    );
    setSmilesColumn(
      preview.columns.find((name) =>
        /^(smiles|smi|canonical_smiles)$/i.test(name),
      ) ?? "SMILES",
    );
  }, [preview]);
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
        libraryFields: {
          id_column: idColumn,
          smiles_column: smilesColumn,
          delimiter: library?.suffix.includes(".tsv") ? "\t" : ",",
        },
        expert: {
          ...shortlist,
          score,
          pocket_radius: radius,
          batch_size: batch,
          alternate_locations: altloc,
        },
      }),
    );
  }
  return (
    <div className="dataset-workspace dataset-screening-form">
      <GuidedSteps<DatasetExecution>
        language={language}
        busy={run.busy}
        error={run.error || templateError || error}
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
            valid:
              source === "new"
                ? !!library &&
                  (!preview?.table ||
                    (preview.columns.includes(idColumn) &&
                      preview.columns.includes(smilesColumn)))
                : indexes.length > 0,
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
                    <SupplierPicker
                      language={language}
                      value={supplier}
                      onChange={setSupplier}
                    />
                    <LibraryFields
                      language={language}
                      preview={preview}
                      id={idColumn}
                      smiles={smilesColumn}
                      onId={setIdColumn}
                      onSmiles={setSmilesColumn}
                    />
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
                <ShortlistChoices
                  value={shortlist}
                  onChange={setShortlist}
                  language={language}
                />
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
                  <div className="dataset-field-grid">
                    <label className="field">
                      {zh ? "检索评分方法" : "Retrieval scoring"}
                      <select
                        value={score}
                        onChange={(e) =>
                          setScore(e.target.value as typeof score)
                        }
                      >
                        <option value="fold_zscore">
                          {zh
                            ? "六折标准化分数 · 大库推荐"
                            : "Six-fold normalized score · large libraries"}
                        </option>
                        <option value="mean_cosine">
                          {zh
                            ? "六折平均相似度 · 小库可用"
                            : "Mean six-fold similarity · supports small libraries"}
                        </option>
                      </select>
                    </label>
                    <label className="field">
                      {zh ? "蛋白的替代构象" : "Alternate protein conformers"}
                      <select
                        value={altloc}
                        onChange={(e) =>
                          setAltloc(e.target.value as typeof altloc)
                        }
                      >
                        <option value="highest_occupancy">
                          {zh
                            ? "选择占有率最高的主构象"
                            : "Highest-occupancy conformer"}
                        </option>
                        <option value="reject">
                          {zh
                            ? "遇到多构象时先人工确认"
                            : "Require prior manual preparation"}
                        </option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                      </select>
                    </label>
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
                    <label className="field">
                      {zh ? "口袋范围（Å）" : "Pocket radius (Å)"}
                      <select
                        value={radius}
                        onChange={(e) => setRadius(Number(e.target.value))}
                      >
                        {[4, 5, 6, 8, 10].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      {zh ? "每批最多编码分子" : "Maximum molecules per batch"}
                      <select
                        value={batch}
                        onChange={(e) => setBatch(Number(e.target.value))}
                      >
                        {[1, 4, 16, 32, 64].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </div>
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
