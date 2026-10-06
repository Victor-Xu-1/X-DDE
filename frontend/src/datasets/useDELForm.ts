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
import { newReadLane, validReadLanes, type ReadLane } from "./DELReadFiles";
import { delExpertDefaults } from "./DELExpertSettings";
import { useDatasetExample } from "./useDatasetExample";
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
    [expert, setExpert] = useState({ ...delExpertDefaults }),
    [readLanes, setReadLanes] = useState<ReadLane[]>(() => [newReadLane()]),
    [attachmentPolicy, setAttachmentPolicy] = useState<
      "retain" | "cap_hydrogen"
    >("retain");
  const hasFile =
    mode === "validate" ||
    mode === "decode" ||
    mode === "followup" ||
    (mode === "analyze" && inputKind === "new");
  const [templateError, setTemplateError] = useState("");
  const example = useDatasetExample(setTemplateError);
  useEffect(() => {
    if (!example) return;
    const { task, assets, sources } = example,
      payload = task.payload;
    setAsset(assets.get(task.inputs[0]?.source.asset_id) ?? null);
    setSource(sources.filter((item) => item.role !== "definition"));
    setDefinitions(sources.filter((item) => item.role === "definition"));
    setInputKind(task.inputs.length ? "new" : "counts");
    setName(task.name);
    setSamples((payload.samples as DELSample[]) ?? []);
    setComparisons((payload.comparisons as DELComparison[]) ?? []);
    setComparison(String(payload.chosen_comparison ?? ""));
    setLibrary(String(payload.library ?? ""));
    setSelected((payload.selected_ids as string[]) ?? []);
    setMembers(
      ((payload.selected_members as string[][]) ?? [])
        .map((item) => item.join(","))
        .join("\n"),
    );
    setMemberId(String(payload.id_column ?? "DEL_ID"));
    setSmilesColumn(String(payload.smiles_column ?? "SMILES"));
    setCycleColumns((payload.cycle_columns as string[]) ?? []);
    setCycleA(Number(payload.holdout_cycle ?? 0));
    setCountUnit(String(payload.count_unit ?? "corrected_umi"));
    setEndpoint(String(payload.followup_endpoint ?? "KD"));
    setUnit(String(payload.followup_unit ?? "nM"));
    setValueColumn(String(payload.followup_value_column ?? "value"));
    setAttachmentPolicy(
      payload.attachment_policy === "cap_hydrogen" ? "cap_hydrogen" : "retain",
    );
    if (mode === "decode") {
      const assignments =
        (payload.read_samples as {
          input_label: string;
          sample: string;
          sample_barcode?: string;
          mate_label?: string;
          encoded_mate?: "r1" | "r2";
        }[]) ?? [];
      setReadLanes(
        [...new Set(assignments.map((item) => item.input_label))].map((id) => {
          const groups = assignments.filter((item) => item.input_label === id),
            first = groups[0];
          const material = task.inputs.find((item) => item.label === id),
            mate = task.inputs.find((item) => item.label === first.mate_label);
          return {
            id,
            file: material
              ? (assets.get(material.source.asset_id) ?? null)
              : null,
            mate: mate ? (assets.get(mate.source.asset_id) ?? null) : null,
            paired: !!first.mate_label,
            encodedMate: first.encoded_mate ?? "r1",
            assignments: groups.map((item) => ({
              sample: item.sample,
              barcode: item.sample_barcode ?? "",
            })),
          };
        }),
      );
    }
  }, [example]);
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
    setReadLanes([newReadLane()]);
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
        ? validReadLanes(readLanes) && definitions.length === 1
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
              ? validReadLanes(readLanes, true)
              : firstValid;
  async function chooseDefinition(id: string) {
    setAsset(id ? await request<Asset>(`/assets/${id}/metadata`) : null);
  }
  async function submit() {
    const inputs: DatasetMaterial[] = [],
      sources = [...source];
    if (mode === "validate" && asset)
      inputs.push(materialFor(asset, "definition"));
    if (mode === "decode") {
      for (const lane of readLanes) {
        if (lane.file) inputs.push(materialFor(lane.file, "reads", lane.id));
        if (lane.paired && lane.mate)
          inputs.push(materialFor(lane.mate, "reads", lane.id + "_mate"));
      }
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
          ...expert,
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
          attachment_policy: attachmentPolicy,
          umi_method: umi,
          count_unit: countUnit,
          read_samples:
            mode === "decode"
              ? readLanes.flatMap((lane) =>
                  lane.assignments.map((assignment) => ({
                    input_label: lane.id,
                    sample: assignment.sample,
                    sample_barcode: assignment.barcode,
                    mate_label: lane.paired ? lane.id + "_mate" : "",
                    encoded_mate: lane.encodedMate,
                  })),
                )
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
    expert,
    setExpert,
    readLanes,
    setReadLanes,
    attachmentPolicy,
    setAttachmentPolicy,
    hasFile,
    preview,
    error,
    templateError,
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
