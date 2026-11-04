import { resolveReference } from "../diffsbdd/reference-metadata";
import type { ScientificTask } from "../integrations/types";
import { assetDownloadUrl } from "../research/asset-download";
import { readAssetFile } from "../research/asset-file";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type { TernaryExecution } from "./execution";
import type { TernaryPayload } from "./types";

export const proteinFormats = [".pdb", ".cif"] as const;
export const moleculeFormats = [".sdf", ".mol"] as const;

export interface TernaryReviewInput {
  language: Language;
  name: string;
  ligand: MoleculeRef | null;
  first: MoleculeRef | null;
  second: MoleculeRef | null;
  armA: MoleculeRef | null;
  armB: MoleculeRef | null;
  payload: TernaryPayload;
  execution: TernaryExecution;
}

export async function prepareTernaryReview(
  input: TernaryReviewInput,
  signal: AbortSignal,
) {
  const { language, ligand, first, second, armA, armB, payload } = input;
  const zh = language === "zh";
  const binary =
    payload.mechanism !== "molecular_glue" &&
    payload.input_mode === "binary_poses";
  const unavailable = zh
    ? "无法核对所选蛋白或分子记录。请重试或返回更换文件。"
    : "The selected proteins or molecule records could not be verified. Retry or return to edit.";
  if (!ligand || !first || !second || (binary && (!armA || !armB)))
    throw new Error(unavailable);

  const inputs: ScientificTask["inputs"] = [
    { role: "ligand", source: ligand },
    { role: "partner_a", source: first },
    { role: "partner_b", source: second },
  ];
  if (binary && armA && armB)
    inputs.push(
      { role: "arm_a", source: armA },
      { role: "arm_b", source: armB },
    );

  const read = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  const checked = new Set<string>();
  try {
    await Promise.all(
      inputs.map(async ({ role, source }) => {
        const protein = role === "partner_a" || role === "partner_b";
        if (source.conformer !== 0 || (protein && source.record !== 0))
          throw new Error(
            "The original conformer and protein file are required.",
          );
        const key = JSON.stringify([
          protein,
          source.asset_id,
          source.sha256,
          source.record,
        ]);
        if (checked.has(key)) return;
        checked.add(key);
        if (protein) {
          await readAssetFile(source, read, {
            kind: "structure",
            suffixes: proteinFormats,
            maxBytes: 25 * 1024 ** 2,
          });
          return;
        }
        await resolveReference(
          source.asset_id,
          "ligand",
          moleculeFormats,
          source,
          read,
        );
        const response = await fetch(
          assetDownloadUrl(source.asset_id, source.record),
          { signal: read },
        );
        const format = response.headers.get("X-Structure-Format");
        const verified =
          response.ok &&
          (format === "sdf" || format === "mol") &&
          response.headers.get("X-Structure-Record") === String(source.record);
        await response.body?.cancel();
        if (!verified)
          throw new Error("The original molecule record is unavailable.");
      }),
    );
    read.throwIfAborted();
  } catch {
    throw new Error(unavailable);
  }

  const task: ScientificTask = {
    operation: "ternary_model",
    name:
      input.name.trim() ||
      (zh
        ? "诱导邻近 · 三元装配探索"
        : "Induced proximity · ternary assemblies"),
    inputs,
    scientific_inputs: inputs.map(({ source }) => source),
    payload,
    options: input.execution,
  };
  return {
    task,
    components: [],
    ligand,
    first,
    second,
    armA: binary ? armA : null,
    armB: binary ? armB : null,
    payload,
  };
}

export type PreparedTernaryReview = Awaited<
  ReturnType<typeof prepareTernaryReview>
>;
