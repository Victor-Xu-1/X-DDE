import { request } from "../api";
import { withConstraints } from "../constraints/model";
import type { ConstraintReference, OutputSettings } from "../constraints/types";
import { acceptedAsset } from "../operations/asset-acceptance";
import type { Asset } from "../operations/types";
import { assetDownloadUrl } from "../research/asset-download";
import { readAssetFile } from "../research/asset-file";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type { DockingTask } from "./types";

export interface DockingJobInput {
  task: DockingTask;
  constraints: ConstraintReference | null;
  outputChoice: "none" | "heavy_atom_centroid" | "all_heavy_atoms";
  outputSettings: OutputSettings;
  language: Language;
}

async function verifyLigand(reference: MoleculeRef, signal: AbortSignal) {
  const id = encodeURIComponent(reference.asset_id);
  const file = await request<Asset>(`/assets/${id}/metadata`, { signal });
  if (
    reference.conformer !== 0 ||
    !Number.isSafeInteger(reference.record) ||
    reference.record < 0 ||
    reference.record > 499 ||
    !acceptedAsset(
      file,
      reference.asset_id,
      "ligand",
      [".sdf"],
      25 * 1024 ** 2,
    ) ||
    file.sha256 !== reference.sha256
  )
    throw new Error("The selected ligand does not match the docking source.");
  const response = await fetch(
    assetDownloadUrl(reference.asset_id, reference.record),
    { signal },
  );
  const verified =
    response.ok &&
    response.headers.get("X-Structure-Record") === String(reference.record) &&
    response.headers.get("X-Structure-Format") === "sdf";
  await response.body?.cancel();
  if (!verified)
    throw new Error("The selected SDF record could not be verified.");
}

/** Verify immutable files and condition support before exposing the submitted body. */
export async function prepareDockingJob(
  input: DockingJobInput,
  signal: AbortSignal,
) {
  const { task, constraints, outputChoice, outputSettings, language } = input;
  const readSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  const zh = language === "zh";
  if (task.receptor.record || task.receptor.conformer)
    throw new Error(
      zh
        ? "对接需要使用受体文件的原始坐标。"
        : "Docking requires the original receptor coordinates.",
    );
  const reference =
    task.search?.kind === "reference_ligand" ? task.search.reference : null;
  const sameRecord =
    reference &&
    reference.asset_id === task.ligand.asset_id &&
    reference.sha256 === task.ligand.sha256 &&
    reference.record === task.ligand.record &&
    reference.conformer === task.ligand.conformer;
  try {
    await Promise.all([
      readAssetFile(task.receptor, readSignal, {
        kind: "structure",
        suffixes: [".pdb"],
        maxBytes: 25 * 1024 ** 2,
      }),
      verifyLigand(task.ligand, readSignal),
      reference && !sameRecord
        ? verifyLigand(reference, readSignal)
        : undefined,
    ]);
  } catch {
    throw new Error(
      zh
        ? "无法核对受体或所选分子记录。请重试，或返回更换文件。"
        : "The receptor or selected molecule records could not be verified. Try again or choose other files.",
    );
  }
  readSignal.throwIfAborted();
  const reviewed = await withConstraints(
    task,
    constraints,
    language,
    outputChoice,
    outputSettings,
  );
  readSignal.throwIfAborted();
  if (reviewed.operation !== "docking")
    throw new Error("Invalid docking review.");
  return { task: reviewed, components: [] };
}
