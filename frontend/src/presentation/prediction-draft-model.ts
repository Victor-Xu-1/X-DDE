import type { Component } from "../types";
import type { CovalentBond } from "../operations/types";
import { mol1Defaults, type Mol1Settings } from "../integrations/mol1-settings";

export interface Mol1DraftState {
  name: string;
  components: Component[];
  settings: Omit<Mol1Settings, "additional_seeds">;
  bonds: CovalentBond[];
  advanced: boolean;
  seed_text: string;
  device: "cpu" | "cuda";
  memory: number;
  seed: number;
}
export interface PredictionDraftSummary {
  id: string;
  tool: "mol1.predict";
  schema_version: 1;
  revision: number;
  name: string;
  entities: number;
  created_at: string;
  updated_at: string;
  archived: boolean;
}
export interface PredictionDraft extends PredictionDraftSummary {
  state: Mol1DraftState;
}
export const parseSeedText = (text: string) =>
  text !== ""
    ? text.split(",").map((token) => (token.trim() ? Number(token) : NaN))
    : [];
export function draftFingerprint(value: unknown): string {
  const normalized =
    record(value) && Array.isArray(value.components)
      ? {
          ...value,
          components: value.components.map((component) =>
            record(component) ? normalizedComponent(component) : component,
          ),
          ...(record(value.workflows)
            ? {
                workflows: Object.fromEntries(
                  Object.entries(value.workflows).map(([kind, rows]) => [
                    kind,
                    Array.isArray(rows)
                      ? rows.map((row) =>
                          record(row) ? normalizedComponent(row) : row,
                        )
                      : rows,
                  ]),
                ),
              }
            : {}),
          ...(Array.isArray(value.input_references)
            ? {
                input_references: value.input_references.map((ref) =>
                  record(ref) ? withoutNulls(ref) : ref,
                ),
              }
            : {}),
        }
      : value;
  return JSON.stringify(normalized, (_, item) =>
    record(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : item,
  );
}

/** Only current native setting keys; no stale preset components or derived seed list. */
export function snapshotMol1Settings(settings: Mol1Settings) {
  return Object.fromEntries(
    Object.keys(mol1Defaults())
      .filter((key) => key !== "additional_seeds")
      .map((key) => [key, settings[key]]),
  ) as Mol1DraftState["settings"];
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const withoutNulls = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null));
const finite = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  Math.abs(value) <= 1e12;
const text = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.length <= limit;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assetFields = [
  "source_sequence",
  "ligand_file",
  "paired_msa",
  "unpaired_msa",
  "template_hits",
] as const;
const only = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

export function draftEntity(value: unknown): value is Component {
  return (
    record(value) &&
    only(value, [
      "kind",
      "value",
      "count",
      "chain_ids",
      "modifications",
      ...assetFields,
    ]) &&
    ["protein", "ligand", "dna", "rna", "ion"].includes(String(value.kind)) &&
    text(value.value, 50000) &&
    finite(value.count) &&
    (value.chain_ids == null ||
      (Array.isArray(value.chain_ids) &&
        value.chain_ids.length <= 32 &&
        value.chain_ids.every((id) => text(id, 32)))) &&
    (value.modifications == null ||
      (Array.isArray(value.modifications) &&
        value.modifications.length <= 5000 &&
        value.modifications.every(
          (item) =>
            record(item) &&
            only(item, ["position", "ccd"]) &&
            finite(item.position) &&
            text(item.ccd, 32),
        ))) &&
    assetFields.every(
      (key) =>
        value[key] == null ||
        (typeof value[key] === "string" && uuid.test(value[key] as string)),
    )
  );
}
export function normalizeDraftEntity(component: Component): Component {
  return withoutNulls(
    component as unknown as Record<string, unknown>,
  ) as unknown as Component;
}
export function draftBond(value: unknown): value is CovalentBond {
  return (
    record(value) &&
    only(value, ["left", "right"]) &&
    atom(value.left) &&
    atom(value.right)
  );
}
function atom(value: unknown) {
  return (
    record(value) &&
    only(value, ["entity", "copy_index", "position", "atom"]) &&
    finite(value.entity) &&
    finite(value.position) &&
    (value.copy_index === null || finite(value.copy_index)) &&
    text(value.atom, 80)
  );
}
function settings(value: unknown) {
  const defaults = snapshotMol1Settings(mol1Defaults());
  const enums: Record<string, string[]> = {
    kind: ["mol1"],
    dtype: ["bf16", "fp32"],
    feature_mode: ["none", "uploaded", "search"],
    diffusion_cache_mode: ["full", "shared", "off"],
  };
  return (
    record(value) &&
    only(value, Object.keys(defaults)) &&
    Object.entries(defaults).every(([key, initial]) =>
      typeof initial === "number"
        ? finite(value[key])
        : typeof initial === "boolean"
          ? typeof value[key] === "boolean"
          : enums[key]?.includes(String(value[key])) === true,
    )
  );
}
/** Validate editor shape, not scientific readiness. Preserve empty and invalid inputs. */
export function readMol1Draft(value: unknown): Mol1DraftState {
  if (
    !record(value) ||
    !only(value, [
      "name",
      "components",
      "settings",
      "bonds",
      "advanced",
      "seed_text",
      "device",
      "memory",
      "seed",
    ]) ||
    !text(value.name, 80) ||
    !Array.isArray(value.components) ||
    value.components.length > 32 ||
    !value.components.every(draftEntity) ||
    !settings(value.settings) ||
    !Array.isArray(value.bonds) ||
    value.bonds.length > 256 ||
    !value.bonds.every(draftBond) ||
    typeof value.advanced !== "boolean" ||
    !text(value.seed_text, 1000) ||
    !["cpu", "cuda"].includes(String(value.device)) ||
    !finite(value.memory) ||
    !finite(value.seed)
  )
    throw new Error(
      "This draft format cannot be opened safely. Your current inputs were retained.",
    );
  const result = value as unknown as Mol1DraftState;
  return {
    ...result,
    // API models may express absent optional references as null. Keep the native editor shape.
    components: result.components.map(normalizeDraftEntity),
  };
}
export function readPredictionDraft(value: PredictionDraft): PredictionDraft {
  if (
    value.tool !== "mol1.predict" ||
    value.schema_version !== 1 ||
    !uuid.test(value.id) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  )
    throw new Error(
      "This draft version is not supported. Your current inputs were retained.",
    );
  return { ...value, state: readMol1Draft(value.state) };
}

/** Nested optional file-version fields also round-trip through API nulls. */
function normalizedComponent(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(withoutNulls(value)).map(([key, item]) => [
      key,
      record(item) ? normalizedComponent(item) : item,
    ]),
  );
}
