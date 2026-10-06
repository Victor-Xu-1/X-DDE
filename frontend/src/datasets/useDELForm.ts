import { useEffect, useState } from "react";
import { request } from "../api";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import type { ToolId } from "../operations/catalog";
import type { Asset } from "../operations/types";
import type { Job, Language } from "../types";
import { materialFor, taskFor } from "./dataset-model";
import { datasetTools } from "./catalog";
import { useDatasetRun } from "./useDatasetRun";
import { useTablePreview } from "./useTablePreview";
import type {
  AvailableDataset,
  DELComparison,
  DELSample,
  DatasetMaterial,
  DatasetSource,
} from "./types";
export function useDELForm({
  tool,
  language,
  onCreated,
}: {
  tool: ToolId;
  language: Language;
  onCreated(job: Job): void;
}) {
  const zh = language === "zh",
    definition = datasetTools.find((item) => item.id === tool)!,
    mode = definition.mode,
    run = useDatasetRun(onCreated),
    readiness = useTaskReadiness(tool),
    [asset, setAsset] = useState<Asset | null>(null),
    [definitions, setDefinitions] = useState<AvailableDataset[]>([]),
    [source, setSource] = useState<AvailableDataset[]>([]),
    [inputKind, setInputKind] = useState<"new" | "counts">("new"),
    [samples, setSamples] = useState<DELSample[]>([]),
    [comparisons, setComparisons] = useState<DELComparison[]>([]),
    [name, setName] = useState(""),
    [memberId, setMemberId] = useState("DEL_ID"),
    [smilesColumn, setSmilesColumn] = useState("SMILES"),
    [cycleColumns, setCycleColumns] = useState<string[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [comparison, setComparison] = useState(""),
    [library, setLibrary] = useState(""),
    [members, setMembers] = useState(""),
    [allMembers, setAllMembers] = useState(false),
    [umi, setUmi] = useState<"directional" | "unique" | "raw">("directional"),
    [countUnit, setCountUnit] = useState("corrected_umi"),
    [cycleA, setCycleA] = useState(0),
    [cycleB, setCycleB] = useState(1),
    [minimum, setMinimum] = useState(10),
    [enrichment, setEnrichment] = useState(3),
    [endpoint, setEndpoint] = useState("KD"),
    [unit, setUnit] = useState("nM"),
    [valueColumn, setValueColumn] = useState("value"),
    [sampleName, setSampleName] = useState("sample1");
  const hasFile =
    mode === "validate" ||
    mode === "decode" ||
    mode === "followup" ||
    (mode === "analyze" && inputKind === "new");
  const { preview, error } = useTablePreview(
    asset && ["analyze", "followup"].includes(mode) ? asset : null,
  );
  useEffect(() => {
    setSource([]);
    setDefinitions([]);
    setAsset(null);
    setSelected([]);
    setComparison("");
    setSamples([]);
    setComparisons([]);
  }, [tool]);
  useEffect(() => {
    if (!preview?.columns.length) return;
    if (preview.columns.includes("DEL_ID")) setMemberId("DEL_ID");
    const smiles = preview.columns.find((value) =>
      /^(smiles|smi)$/i.test(value),
    );
    if (smiles) setSmilesColumn(smiles);
    const cycles = preview.columns.filter((value) => /^ID_[A-H]$/.test(value));
    setCycleColumns(cycles);
  }, [preview]);
  const nativeSamples = Object.keys(
    (source[0]?.metadata.sample_totals as
      Record<string, unknown> | undefined) ?? {},
  );
  const columns = preview?.columns ?? nativeSamples;
  const availableComparisons =
    (source[0]?.metadata.comparisons as
      { id: string; selection: string; reference: string }[] | undefined) ?? [];
  const availableLibraries =
    (definitions[0]?.metadata.libraries as
      { library: string; members: number; cycles: number }[] | undefined) ?? [];
  useEffect(() => {
    setLibrary(availableLibraries[0]?.library ?? "");
  }, [definitions[0]?.job_id]);
  useEffect(() => {
    setComparison(availableComparisons[0]?.id ?? "");
  }, [source[0]?.job_id]);
  const sourceRole: DatasetSource["role"] =
    mode === "analyze" ? "counts" : mode === "count" ? "decoded" : "analysis";
  const firstValid =
    mode === "validate"
      ? !!asset
      : mode === "decode"
        ? !!asset && definitions.length === 1
        : mode === "enumerate"
          ? definitions.length === 1
          : mode === "analyze"
            ? inputKind === "new"
              ? !!asset
              : source.length === 1
            : mode === "followup"
              ? !!asset && source.length === 1
              : source.length === 1;
  const planValid =
    mode === "analyze"
      ? samples.length > 0 &&
        (!preview?.table || preview.columns.includes(memberId))
      : mode === "enumerate"
        ? !!library && (allMembers || !!members.trim())
        : mode === "candidates"
          ? selected.length > 0
          : mode === "series" || mode === "model"
            ? !!comparison
            : mode === "decode"
              ? !!sampleName
              : firstValid;
  async function chooseDefinition(id: string) {
    setAsset(id ? await request<Asset>(`/assets/${id}/metadata`) : null);
  }
  async function submit() {
    const inputs: DatasetMaterial[] = [],
      sources = [...source];
    if (mode === "validate" && asset)
      inputs.push(materialFor(asset, "definition"));
    if (mode === "decode" && asset) {
      inputs.push(materialFor(asset, "reads", "reads1"));
      sources.splice(0, sources.length, ...definitions);
    }
    if (mode === "enumerate") sources.splice(0, sources.length, ...definitions);
    if (
      ((mode === "analyze" && inputKind === "new") || mode === "followup") &&
      asset
    )
      inputs.push(materialFor(asset, "counts"));
    if (mode === "analyze" && inputKind === "new")
      sources.splice(0, sources.length);
    if (mode === "candidates" && definitions.length)
      sources.push(definitions[0]);
    const parsed = members
      .split(/\r?\n/)
      .filter((value) => value.trim())
      .map((line) => line.trim().split(/[\s,]+/));
    return run.submit(
      taskFor(
        tool,
        {
          kind: "deli",
          mode,
          library,
          selected_members: parsed,
          enumerate_all: allMembers,
          id_column: memberId,
          smiles_column: smilesColumn,
          cycle_columns: cycleColumns,
          samples,
          comparisons,
          chosen_comparison: comparison,
          selected_ids: selected,
          umi_method: umi,
          count_unit: countUnit,
          read_samples:
            mode === "decode"
              ? [
                  {
                    input_label: "reads1",
                    sample: sampleName,
                    sample_barcode: "",
                  },
                ]
              : [],
          series_cycles: [cycleA, cycleB],
          holdout_cycle: cycleA,
          minimum_counts: minimum,
          minimum_enrichment: enrichment,
          followup_id_column: memberId,
          followup_value_column: valueColumn,
          followup_endpoint: endpoint,
          followup_unit: unit,
          delimiter: asset?.suffix.includes(".tsv") ? "\t" : ",",
        },
        inputs,
        sources,
        name.trim() || definition.label[zh ? 0 : 1],
      ),
    );
  }

  return {
    language,
    onCreated,
    tool,
    zh,
    definition,
    mode,
    run,
    readiness,
    asset,
    setAsset,
    definitions,
    setDefinitions,
    source,
    setSource,
    inputKind,
    setInputKind,
    samples,
    setSamples,
    comparisons,
    setComparisons,
    name,
    setName,
    memberId,
    setMemberId,
    smilesColumn,
    setSmilesColumn,
    cycleColumns,
    setCycleColumns,
    selected,
    setSelected,
    comparison,
    setComparison,
    library,
    setLibrary,
    members,
    setMembers,
    allMembers,
    setAllMembers,
    umi,
    setUmi,
    countUnit,
    setCountUnit,
    cycleA,
    setCycleA,
    cycleB,
    setCycleB,
    minimum,
    setMinimum,
    enrichment,
    setEnrichment,
    endpoint,
    setEndpoint,
    unit,
    setUnit,
    valueColumn,
    setValueColumn,
    sampleName,
    setSampleName,
    hasFile,
    preview,
    error,
    nativeSamples,
    columns,
    availableComparisons,
    availableLibraries,
    sourceRole,
    firstValid,
    planValid,
    chooseDefinition,
    submit,
  };
}
export type DELFormState = ReturnType<typeof useDELForm>;
