import type { Component, Parameters } from "../types";
import type { CovalentBond } from "./types";
import type { MoleculeRef } from "../research/types";
import { taskKinds, type TaskKind } from "../guided/presets";
import type { IntegerText } from "./integer-list-model";
import {
  draftBond,
  draftEntity,
  normalizeDraftEntity,
} from "../presentation/prediction-draft-model";
import {
  draftRecord,
  type DraftAdapter,
  type DraftRecord,
} from "../presentation/prediction-draft-contract";

export interface OpenDdeDraftState {
  name: string;
  kind: TaskKind;
  components: Component[];
  workflows: Partial<Record<TaskKind, Component[]>>;
  parameters: Parameters;
  bonds: CovalentBond[];
  expert: boolean;
  input_references: MoleculeRef[];
  integer_text: IntegerText;
}
export type OpenDdeDraft = DraftRecord<OpenDdeDraftState, "predict">;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const only = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const text = (value: unknown, limit: number) =>
  typeof value === "string" && value.length <= limit;
const finite = (value: unknown) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  Math.abs(value) <= 1e12;
const uuid = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const numbers = ["seed", "samples", "steps", "cycles", "search_cpus"];
const flags = [
  "distributed",
  "tfg",
  "atom_confidence",
  "enable_cache",
  "enable_fusion",
  "enable_tf32",
  "deterministic",
  "use_template",
  "use_rna_msa",
  "allow_network",
];
const enums: Record<string, string[]> = {
  dtype: ["bf16", "fp32"],
  model: ["standard", "abag"],
  device: ["cpu", "cuda"],
  feature_mode: ["none", "uploaded", "search"],
  triatt_kernel: ["auto", "cuequivariance", "torch"],
  trimul_kernel: ["auto", "cuequivariance", "torch"],
};
export const openDdeDraftParameterKeys = [
  ...numbers,
  ...flags,
  ...Object.keys(enums),
  "additional_seeds",
  "gpu_ids",
  "checkpoint_id",
];
function parameters(value: unknown) {
  if (
    !object(value) ||
    !["seed", "samples", "steps", "cycles", "dtype"].every(
      (key) => key in value,
    )
  )
    return false;
  return Object.entries(value).every(([key, item]) => {
    if (numbers.includes(key)) return finite(item);
    if (flags.includes(key)) return typeof item === "boolean";
    if (Object.hasOwn(enums, key))
      return typeof item === "string" && enums[key].includes(item);
    if (key === "additional_seeds" || key === "gpu_ids")
      return Array.isArray(item) && item.length <= 32 && item.every(finite);
    return key === "checkpoint_id" && (item === null || text(item, 1000));
  });
}
function components(value: unknown): value is Component[] {
  return Array.isArray(value) && value.length <= 32 && value.every(draftEntity);
}
function reference(value: unknown) {
  return (
    object(value) &&
    only(value, ["asset_id", "sha256", "record", "conformer", "version_id"]) &&
    uuid(value.asset_id) &&
    typeof value.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    finite(value.record) &&
    finite(value.conformer) &&
    (value.version_id == null || uuid(value.version_id))
  );
}
/** Editor shape only: unfinished inputs stay visible; native review admits jobs. */
export function readOpenDdeDraft(value: unknown): OpenDdeDraftState {
  const kinds = taskKinds.map((kind) => kind.id);
  if (
    !object(value) ||
    !only(value, [
      "name",
      "kind",
      "components",
      "workflows",
      "parameters",
      "bonds",
      "expert",
      "input_references",
      "integer_text",
    ]) ||
    !text(value.name, 80) ||
    !kinds.includes(value.kind as TaskKind) ||
    !components(value.components) ||
    !object(value.workflows) ||
    !only(value.workflows, kinds) ||
    !Object.values(value.workflows).every(components) ||
    !parameters(value.parameters) ||
    !Array.isArray(value.bonds) ||
    value.bonds.length > 256 ||
    !value.bonds.every(draftBond) ||
    typeof value.expert !== "boolean" ||
    !Array.isArray(value.input_references) ||
    value.input_references.length > 128 ||
    !value.input_references.every(reference) ||
    !object(value.integer_text) ||
    !only(value.integer_text, ["additional_seeds", "gpu_ids"]) ||
    !Object.values(value.integer_text).every((item) => text(item, 1000)) ||
    new TextEncoder().encode(JSON.stringify(value)).length > 200000
  )
    throw new Error(
      "This OpenDDE draft cannot be opened safely. Your current inputs were retained.",
    );
  const state = value as unknown as OpenDdeDraftState;
  return {
    ...state,
    components: state.components.map(normalizeDraftEntity),
    workflows: Object.fromEntries(
      Object.entries(state.workflows).map(([kind, rows]) => [
        kind,
        rows!.map(normalizeDraftEntity),
      ]),
    ),
    input_references: state.input_references.map((ref) =>
      ref.version_id == null
        ? (Object.fromEntries(
            Object.entries(ref).filter(([key]) => key !== "version_id"),
          ) as unknown as MoleculeRef)
        : ref,
    ),
  };
}
export const openDdeDraftAdapter: DraftAdapter<OpenDdeDraftState, "predict"> = {
  tool: "predict",
  model: "OpenDDE",
  readState: readOpenDdeDraft,
  readDraft: (value) => draftRecord(value, "predict", readOpenDdeDraft),
};
