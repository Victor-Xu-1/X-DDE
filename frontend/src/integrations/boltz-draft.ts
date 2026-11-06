import type { BoltzComponent } from "./boltz-inputs";
import type { ScientificPayload, ScientificTask } from "./types";
import { nativeDefaults } from "./generated";
import {
  draftRecord,
  type DraftAdapter,
  type DraftRecord,
} from "../presentation/prediction-draft-contract";

export interface BoltzDraftState {
  name: string;
  components: BoltzComponent[];
  settings: ScientificPayload & { kind: "boltz" };
  options: ScientificTask["options"];
  expert: boolean;
}
export type BoltzDraft = DraftRecord<BoltzDraftState, "boltz.predict">;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const only = (value: Record<string, unknown>, keys: string[]) =>
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
function source(value: unknown) {
  return (
    value == null ||
    (object(value) &&
      only(value, [
        "asset_id",
        "sha256",
        "record",
        "conformer",
        "version_id",
      ]) &&
      uuid(value.asset_id) &&
      typeof value.sha256 === "string" &&
      /^[0-9a-f]{64}$/.test(value.sha256) &&
      finite(value.record) &&
      finite(value.conformer) &&
      (value.version_id == null || uuid(value.version_id)))
  );
}
export function snapshotBoltzSettings(
  value: ScientificPayload,
): BoltzDraftState["settings"] {
  return Object.fromEntries(
    Object.keys(nativeDefaults.boltz).map((key) => [key, value[key]]),
  ) as BoltzDraftState["settings"];
}
export function readBoltzDraft(value: unknown): BoltzDraftState {
  if (
    !object(value) ||
    !only(value, ["name", "components", "settings", "options", "expert"]) ||
    !text(value.name, 80) ||
    !Array.isArray(value.components) ||
    value.components.length > 32 ||
    !value.components.every(
      (item) =>
        object(item) &&
        only(item, ["id", "kind", "value", "source", "msa", "msa_mode"]) &&
        text(item.id, 32) &&
        ["protein", "ligand", "rna", "dna"].includes(String(item.kind)) &&
        text(item.value, 50000) &&
        source(item.source) &&
        source(item.msa) &&
        (item.msa_mode == null ||
          ["provided", "single"].includes(String(item.msa_mode))),
    ) ||
    !object(value.settings) ||
    !only(value.settings, Object.keys(nativeDefaults.boltz)) ||
    value.settings.kind !== "boltz" ||
    ![
      value.settings.samples,
      value.settings.recycling_steps,
      value.settings.sampling_steps,
    ].every(finite) ||
    typeof value.settings.affinity !== "boolean" ||
    !object(value.options) ||
    !only(value.options, ["device", "cpu", "memory_mib", "seed"]) ||
    !["cpu", "cuda"].includes(String(value.options.device)) ||
    ![value.options.cpu, value.options.memory_mib, value.options.seed].every(
      finite,
    ) ||
    typeof value.expert !== "boolean" ||
    new TextEncoder().encode(JSON.stringify(value)).length > 200000
  )
    throw new Error(
      "This Boltz-2 draft cannot be opened safely. Your current inputs were retained.",
    );
  return value as unknown as BoltzDraftState;
}
export const boltzDraftAdapter: DraftAdapter<BoltzDraftState, "boltz.predict"> =
  {
    tool: "boltz.predict",
    model: "Boltz-2",
    readState: readBoltzDraft,
    readDraft: (value) => draftRecord(value, "boltz.predict", readBoltzDraft),
  };
