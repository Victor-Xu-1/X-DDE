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
import type { ShortlistSettings } from "./ShortlistChoices";
import { ScreeningReview } from "./ScreeningReview";
import type { PublicLibraryFile } from "./PublicLibraryFiles";

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
    [publicResource, setPublicResource] = useState<PublicLibraryFile | null>(
      null,
    ),
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
    if (preview?.sdf_properties) {
      setIdColumn(
        preview.sdf_properties.find((column) =>
          /^(id|id[_ ]?number|cat(alog)?[_ ]?(no|number)|code|cmpdid)$/i.test(
            column,
          ),
        ) ?? "_Name",
      );
      return;
    }
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
          source_permission:
            publicResource?.asset?.id === library?.id
              ? "official_public_resource"
              : "user_owned_file",
          source_url:
            publicResource?.asset?.id === library?.id
              ? publicResource?.source_page
              : "",
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
            ? "请在安装与组件中准备高通量筛选、分子处理，以及所选方案所需的对接环境。"
            : "Prepare high-throughput screening, molecular processing and docking if selected in Components."
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
                      onChange={(next) => {
                        setLibrary(next);
                        setPublicResource(null);
                      }}
                      onResource={(resource) => {
                        setPublicResource(resource);
                        setSupplier(resource.supplier);
                        setIdColumn(resource.id_column);
                      }}
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
              <ScreeningReview
                language={language}
                profile={profile}
                setProfile={setProfile}
                preset={preset}
                name={name}
                setName={setName}
                shortlist={shortlist}
                setShortlist={setShortlist}
                score={score}
                setScore={setScore}
                altloc={altloc}
                setAltloc={setAltloc}
                device={device}
                setDevice={setDevice}
                radius={radius}
                setRadius={setRadius}
                batch={batch}
                setBatch={setBatch}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
