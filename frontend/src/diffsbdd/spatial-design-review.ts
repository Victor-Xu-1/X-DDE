import { api, artifactUrl, request } from "../api";
import { validIdentity, type SavedRegion } from "../regions/model";
import { withConstraints } from "../constraints/model";
import type { ConstraintReference } from "../constraints/types";
import { assetDownloadUrl } from "../research/asset-download";
import { readAssetFile } from "../research/asset-file";
import type { MoleculeRef } from "../research/types";
import { resolveReference } from "./reference-metadata";
import type { Language } from "../types";
import { designPayload, fixedCoreIndices, referenceKey } from "./model";
import type { DesignMode, DiffTask, Pocket } from "./types";

export type SpatialDesignMode = DesignMode | "pocket";

export interface CorePreviewSource {
  reference: MoleculeRef;
  url: string;
  selectable: number[];
}

async function savedCorePreview(
  job: string,
  initial: MoleculeRef,
  signal: AbortSignal,
): Promise<CorePreviewSource | null> {
  try {
    const identity: unknown = await api.result(job, signal);
    if (!validIdentity(identity, initial)) return null;
    return {
      reference: identity.reference,
      url: artifactUrl(job, identity.molecule_artifact),
      selectable: identity.atoms
        .filter((atom) => atom.selectable)
        .map((atom) => atom.index),
    };
  } catch {
    // A missing historical display artifact does not change the submitted selection.
    return null;
  }
}

export interface SpatialDesignReviewInput {
  mode: SpatialDesignMode;
  protein: MoleculeRef | null;
  pocket: Pocket | null;
  molecule: MoleculeRef | null;
  name: string;
  options: Record<string, unknown>;
  fixed: number[];
  savedRegions: string | null;
  constraints: ConstraintReference | null;
  language: Language;
}

async function verifySdfSource(ref: MoleculeRef, signal: AbortSignal) {
  await resolveReference(ref.asset_id, "ligand", [".sdf"], ref, signal);
  if (ref.conformer !== 0)
    throw new Error("Selected molecule differs from its source.");
  const response = await fetch(assetDownloadUrl(ref.asset_id, ref.record), {
    signal,
  });
  const verified =
    response.ok &&
    response.headers.get("X-Structure-Format") === "sdf" &&
    response.headers.get("X-Structure-Record") === String(ref.record);
  await response.body?.cancel();
  if (!verified) throw new Error("Selected molecule record is unavailable.");
}

export async function prepareSpatialDesign(
  input: SpatialDesignReviewInput,
  signal: AbortSignal,
) {
  const {
    mode,
    protein,
    pocket,
    options,
    fixed,
    savedRegions,
    constraints,
    language,
  } = input;
  const zh = language === "zh";
  if (!protein || !pocket)
    throw new Error(
      zh ? "请选择受体和口袋。" : "Choose a receptor and a pocket.",
    );
  const initial =
    mode !== "generate" && mode !== "pocket" ? input.molecule : null;
  const payload: DiffTask["payload"] =
    mode === "pocket"
      ? { mode, protein, pocket }
      : designPayload(
          mode,
          protein,
          pocket,
          initial,
          options,
          fixed,
          savedRegions,
        );
  const read = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  const ligand = pocket.kind === "ligand" ? pocket.ligand : null;
  try {
    await Promise.all([
      readAssetFile(protein, read, {
        kind: "structure",
        suffixes: [".pdb"],
        maxBytes: 25 * 1024 ** 2,
      }),
      ligand && verifySdfSource(ligand, read),
      initial &&
        referenceKey(initial) !== referenceKey(ligand) &&
        verifySdfSource(initial, read),
    ]);
  } catch {
    throw new Error(
      zh
        ? "无法核对所选受体或分子记录。请重试或返回更换文件。"
        : "The selected receptor or molecule records could not be verified. Retry or return to edit.",
    );
  }
  read.throwIfAborted();
  const task: DiffTask = {
    operation: "diffsbdd",
    name: input.name,
    payload,
  };
  const reviewed = await withConstraints(task, constraints, language);
  read.throwIfAborted();
  if (reviewed.operation !== "diffsbdd")
    throw new Error("Invalid DiffSBDD request.");
  let savedCore: CorePreviewSource | null = null;
  if (mode === "inpaint" && savedRegions && initial) {
    const region = await request<SavedRegion>(
      "/research/regions/" + encodeURIComponent(savedRegions),
      { signal: read },
    );
    if (
      region.id !== savedRegions ||
      referenceKey(region.body.subject) !== referenceKey(initial) ||
      JSON.stringify(fixedCoreIndices(region.body.regions)) !==
        JSON.stringify(fixed)
    )
      throw new Error(
        zh
          ? "已保存选区与当前固定原子不一致，请返回重新选择。"
          : "The saved region differs from the selected fixed atoms. Return to edit the selection.",
      );
    savedCore = await savedCorePreview(
      region.body.identity_job,
      initial,
      AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    );
  }
  signal.throwIfAborted();
  return {
    task: reviewed,
    savedCore,
    components: [],
    protein,
    pocket,
    initial,
    options,
    fixed,
    mode,
  };
}
