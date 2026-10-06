import type { ToolId } from "../operations/catalog";
import { datasetTools } from "./catalog";
import type { Asset } from "../operations/types";
import type {
  DatasetMaterial,
  DatasetSource,
  DatasetTask,
  DatasetOperation,
  PocketSelection,
} from "./types";
import type { WorkflowPlanInput, WorkflowStep } from "../workflows/types";
import type { ShortlistSettings } from "./ShortlistChoices";

export function isDatasetTool(tool: string): boolean {
  return datasetTools.some((value) => value.id === tool);
}
export function taskFor(
  tool: ToolId,
  payload: DatasetTask["payload"],
  inputs: DatasetMaterial[],
  sources: DatasetSource[],
  name: string,
  execution: DatasetTask["options"] = {
    device: "cpu",
    cpu: 2,
    memory_mib: 4096,
    seed: 101,
  },
): DatasetTask {
  const definition = datasetTools.find((value) => value.id === tool);
  if (!definition) throw new Error("Choose a registered scientific data task.");
  return {
    operation: definition.operation as DatasetOperation,
    name,
    inputs,
    sources: sources.map(({ job_id, report_sha256, role }) => ({
      job_id,
      report_sha256,
      role,
    })),
    payload,
    options: execution,
    scientific_inputs: inputs.map((item) => item.source),
  };
}
export const materialFor = (
  asset: Asset,
  role: DatasetMaterial["role"],
  label = "",
): DatasetMaterial => ({
  role,
  label,
  source: { asset_id: asset.id, sha256: asset.sha256, record: 0, conformer: 0 },
});
const unresolved = (role: DatasetSource["role"]): DatasetSource => ({
  job_id: crypto.randomUUID(),
  report_sha256: "0".repeat(64),
  role,
});
const step = (
  id: string,
  request: DatasetTask,
  previous?: string,
  role?: DatasetSource["role"],
): WorkflowStep => ({
  id,
  request,
  depends_on: previous ? [previous] : [],
  retries: 0,
  bindings: [],
  ...(previous && role
    ? { data_bindings: [{ from_step: previous, slot: 0, role }] }
    : {}),
});
export function screeningPlan({
  name,
  library,
  supplier,
  existingIndexes,
  receptorInputs,
  pocket,
  topK,
  retain,
  dock,
  device,
  libraryFields = {},
  expert = {},
}: {
  name: string;
  library: Asset | null;
  supplier: string;
  existingIndexes: DatasetSource[];
  receptorInputs: DatasetMaterial[];
  pocket: PocketSelection;
  topK: number;
  retain: number;
  dock: boolean;
  device: "cpu" | "cuda";
  libraryFields?: {
    id_column?: string;
    smiles_column?: string;
    delimiter?: "," | "\t";
  };
  expert?: Partial<ShortlistSettings> & {
    batch_size?: number;
    pocket_radius?: number;
    score?: "fold_zscore" | "mean_cosine";
    top_k?: number;
    retain?: number;
    alternate_locations?: "reject" | "highest_occupancy" | "A" | "B";
  };
}): WorkflowPlanInput {
  const execution = { device, cpu: 2, memory_mib: 8192, seed: 101 } as const;
  const stages: WorkflowStep[] = [];
  let indexes = existingIndexes;
  if (library) {
    stages.push(
      step(
        "library",
        taskFor(
          "library.import",
          {
            kind: "chemistry",
            mode: "prepare",
            supplier,
            library_name: library.name,
            ...libraryFields,
          },
          [materialFor(library, "data")],
          [],
          name + " · library",
        ),
      ),
    );
    stages.push(
      step(
        "index",
        taskFor(
          "drugclip.index",
          {
            kind: "drugclip",
            mode: "index",
            use: "non_commercial",
            ...(expert.batch_size ? { batch_size: expert.batch_size } : {}),
          },
          [],
          [unresolved("library")],
          name + " · index",
          execution,
        ),
        "library",
        "library",
      ),
    );
    indexes = [unresolved("index")];
  }
  if (!indexes.length || !receptorInputs.length)
    throw new Error("Choose a target, pocket and molecular library.");
  const retrieval = step(
    "screen",
    taskFor(
      "drugclip.screen",
      {
        kind: "drugclip",
        mode: "retrieve",
        use: "non_commercial",
        receptor: receptorInputs[0].source,
        search: pocket,
        top_k: topK,
        retain,
        score: "fold_zscore",
        ...expert,
      },
      receptorInputs,
      indexes,
      name + " · screening",
      execution,
    ),
    library ? "index" : undefined,
    library ? "index" : undefined,
  );
  stages.push(retrieval);
  if (dock) {
    const docking = step(
      "dock",
      taskFor(
        "screening.dock",
        {
          kind: "gnina",
          mode: "batch",
          alternate_locations:
            expert.alternate_locations ?? "highest_occupancy",
          receptor: receptorInputs[0].source,
          search: pocket,
          selected_ids: ["planned-candidates"],
          docking: {
            use_gpu: device === "cuda",
            cpu: 2,
            memory_mib: 8192,
            exhaustiveness: 8,
            num_modes: 3,
            cnn_scoring: device === "cuda" ? "rescore" : "none",
            time_limit_seconds: 900,
          },
        },
        receptorInputs,
        [unresolved("screening")],
        name + " · docking",
        execution,
      ),
      "screen",
      "screening",
    );
    docking.data_bindings![0].select_candidates = true;
    stages.push(docking);
  }
  return {
    name,
    steps: stages,
    budget: { max_jobs: stages.length, wall_seconds: 86400 },
  };
}
