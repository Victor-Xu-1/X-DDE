import { SupplierPicker } from "./SupplierPicker";
import { LibraryFields } from "./LibraryFields";
import { useDatasetExample } from "./useDatasetExample";
import { useEffect, useState } from "react";
import { GuidedSteps } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import type { ToolId } from "../operations/catalog";
import type { Asset } from "../operations/types";
import type { Job, Language } from "../types";
import { DatasetPicker } from "./DatasetPicker";
import { SourcePicker } from "./SourcePicker";
import { ResearchTable } from "./ResearchTable";
import { materialFor, taskFor } from "./dataset-model";
import { useDatasetRun, type DatasetExecution } from "./useDatasetRun";
import { ExecutionView } from "./ExecutionView";
import { useTablePreview } from "./useTablePreview";
import type { AvailableDataset } from "./types";
import { datasetName } from "./source-label";
import type { PublicLibraryFile } from "./PublicLibraryFiles";

export function LibraryForm({
  tool,
  language,
  onCreated,
}: {
  tool: ToolId;
  language: Language;
  onCreated(job: Job): void;
}) {
  const zh = language === "zh",
    importing = tool === "library.import",
    indexing = tool === "drugclip.index",
    run = useDatasetRun(onCreated),
    ready = useTaskReadiness(tool),
    [asset, setAsset] = useState<Asset | null>(null),
    [publicResource, setPublicResource] = useState<PublicLibraryFile | null>(
      null,
    ),
    [source, setSource] = useState<AvailableDataset[]>([]),
    [supplier, setSupplier] = useState("custom"),
    [idColumn, setIdColumn] = useState("ID"),
    [smilesColumn, setSmilesColumn] = useState("SMILES"),
    [selected, setSelected] = useState<string[]>([]),
    [name, setName] = useState(""),
    [device, setDevice] = useState<"cpu" | "cuda">("cpu");
  const [templateError, setTemplateError] = useState("");
  const { preview, error } = useTablePreview(importing ? asset : null);
  const example = useDatasetExample(setTemplateError, language);
  useEffect(() => {
    if (!example) return;
    const { task, assets, sources } = example;
    setAsset(assets.get(task.inputs[0]?.source.asset_id) ?? null);
    setSource(sources);
    setSelected((task.payload.selected_ids as string[]) ?? []);
    setSupplier(String(task.payload.supplier ?? "custom"));
    setIdColumn(String(task.payload.id_column ?? "ID"));
    setSmilesColumn(String(task.payload.smiles_column ?? "SMILES"));
    setName(task.name);
  }, [example]);

  useEffect(() => {
    if (preview?.sdf_properties) {
      const candidate = preview.sdf_properties.find((column) =>
        /^(id|id[_ ]?number|cat(alog)?[_ ]?(no|number)|code|cmpdid)$/i.test(
          column,
        ),
      );
      setIdColumn(candidate ?? "_Name");
      return;
    }
    if (!preview?.columns.length) return;
    const ids = preview.columns.find((column) =>
      /^(id|compound_id|catalog.?id|molport.?id|chembl.?id)$/i.test(column),
    );
    const smiles = preview.columns.find((column) =>
      /^(smiles|smi|canonical_smiles)$/i.test(column),
    );
    if (ids) setIdColumn(ids);
    if (smiles) setSmilesColumn(smiles);
  }, [preview]);
  const purpose = indexing
    ? zh
      ? "建立快速筛选索引"
      : "Build a fast screening index"
    : importing
      ? zh
        ? "导入新分子库"
        : "Import a compound library"
      : zh
        ? "提取候选分子"
        : "Extract candidates";
  async function submit() {
    const payload = indexing
      ? { kind: "drugclip" as const, mode: "index", use: "non_commercial" }
      : importing
        ? {
            kind: "chemistry" as const,
            mode: "prepare",
            supplier,
            library_name: name.trim() || asset?.name || purpose,
            id_column: idColumn,
            smiles_column: smilesColumn,
            source_permission:
              publicResource?.asset?.id === asset?.id
                ? "official_public_resource"
                : "user_owned_file",
            source_url:
              publicResource?.asset?.id === asset?.id
                ? publicResource?.source_page
                : "",
            delimiter: asset?.suffix.includes(".tsv") ? "\t" : ",",
          }
        : {
            kind: "chemistry" as const,
            mode: "subset",
            selected_ids: selected,
            generate_conformers: true,
          };
    return run.submit(
      taskFor(
        tool,
        payload,
        importing && asset ? [materialFor(asset, "data")] : [],
        importing ? [] : source,
        name.trim() || purpose,
        {
          device: indexing ? device : "cpu",
          cpu: 2,
          memory_mib: indexing ? 8192 : 4096,
          seed: 101,
        },
      ),
    );
  }
  return (
    <div className="dataset-workspace">
      <GuidedSteps<DatasetExecution>
        language={language}
        busy={run.busy}
        error={run.error || templateError || error}
        ready={ready.ready}
        unavailable={
          zh
            ? "请先在安装与组件中准备对应计算环境。"
            : "Prepare the corresponding environment in Components first."
        }
        submitLabel={zh ? "提交任务" : "Submit task"}
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
            title: zh ? "选择材料" : "Choose materials",
            valid: importing ? !!asset : source.length === 1,
            content: (
              <div className="dataset-question-content">
                {importing ? (
                  <DatasetPicker
                    kind="library"
                    label={
                      zh
                        ? "上传供应商或自有分子库"
                        : "Supplier or owned compound file"
                    }
                    value={asset}
                    onChange={(next) => {
                      setAsset(next);
                      setPublicResource(null);
                    }}
                    onResource={(resource) => {
                      setPublicResource(resource);
                      setSupplier(resource.supplier);
                      setIdColumn(resource.id_column);
                    }}
                    language={language}
                  />
                ) : (
                  <SourcePicker
                    role="library"
                    label={
                      zh ? "选择已准备的分子库" : "Prepared molecular library"
                    }
                    language={language}
                    values={source}
                    onChange={(value) => {
                      setSource(value);
                      setSelected([]);
                    }}
                  />
                )}
              </div>
            ),
          },
          {
            title: importing
              ? zh
                ? "确认分子信息"
                : "Confirm molecule fields"
              : indexing
                ? zh
                  ? "确认分子库"
                  : "Confirm library"
                : zh
                  ? "选择候选"
                  : "Select candidates",
            valid: importing
              ? !!asset &&
                (!preview?.table ||
                  (preview.columns.includes(idColumn) &&
                    preview.columns.includes(smilesColumn)))
              : indexing
                ? source.length === 1
                : selected.length > 0,
            content: (
              <div className="dataset-question-content">
                {importing ? (
                  <>
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
                    {preview?.rows.length ? (
                      <div className="dataset-input-sample">
                        <table>
                          <thead>
                            <tr>
                              <th>{idColumn}</th>
                              <th>SMILES</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.rows.slice(0, 3).map((row, index) => (
                              <tr key={index}>
                                <td>{row[idColumn]}</td>
                                <td className="dataset-smiles-text">
                                  {row[smilesColumn]}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </>
                ) : indexing ? (
                  <div className="dataset-review-strip">
                    <div>
                      <span>{zh ? "独立分子" : "Unique compounds"}</span>
                      <strong>
                        {source[0]?.counts.unique_compounds?.toLocaleString()}
                      </strong>
                    </div>
                    <div>
                      <span>{zh ? "模型" : "Model"}</span>
                      <strong>
                        {zh
                          ? "口袋–分子联合检索 · 六模型"
                          : "Pocket–molecule retrieval · 6 models"}
                      </strong>
                    </div>
                  </div>
                ) : (
                  source[0] && (
                    <ResearchTable
                      jobId={source[0].job_id}
                      view="library"
                      language={language}
                      onSelection={setSelected}
                      selection={selected}
                    />
                  )
                )}
              </div>
            ),
          },
          {
            title: zh ? "选择处理方案" : "Choose processing",
            valid: importing ? !!asset : source.length === 1,
            content: (
              <div className="dataset-question-content">
                <div className="dataset-plan-choice">
                  <strong>{purpose}</strong>
                  <p>
                    {indexing
                      ? zh
                        ? "分子仅编码一次，后续口袋筛选可以直接使用这个索引。"
                        : "Molecules encode once; subsequent pocket screens reuse the index."
                      : importing
                        ? zh
                          ? "保留原始化学结构和每条货号；相同结构会合并，所有来源仍可追溯。"
                          : "Preserve original chemistry and supplier IDs; identical structures share one identity with all source records retained."
                        : zh
                          ? "保存选中分子，并为缺少三维坐标的成员生成游离构象。"
                          : "Save selected molecules and generate unbound conformers when 3D coordinates are absent."}
                  </p>
                </div>
                {indexing && (
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
                        <option>cpu</option>
                        <option>cuda</option>
                      </select>
                    </label>
                  </details>
                )}
              </div>
            ),
          },
          {
            title: zh ? "确认提交" : "Review submission",
            valid: importing
              ? !!asset
              : indexing
                ? source.length === 1
                : selected.length > 0,
            content: (
              <div className="dataset-question-content">
                <label className="field">
                  {zh ? "任务名称" : "Task name"}
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={purpose}
                    maxLength={70}
                  />
                </label>
                <div className="dataset-review-strip">
                  <div>
                    <span>{zh ? "研究材料" : "Materials"}</span>
                    <strong>
                      {asset?.name ??
                        (source[0] ? datasetName(source[0], language) : "")}
                    </strong>
                  </div>
                  {!importing && !indexing && (
                    <div>
                      <span>{zh ? "选中分子" : "Selected molecules"}</span>
                      <strong>{selected.length}</strong>
                    </div>
                  )}
                </div>
                {indexing && (
                  <p className="dataset-license-note">
                    {zh
                      ? "官方模型与输出用于非商业科研。"
                      : "Official models and outputs are for noncommercial research."}
                  </p>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
