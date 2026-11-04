import { request } from "../api";
import type { Asset } from "../operations/types";
import type { MoleculeRef } from "../research/types";
import type { PreviewComponent } from "../presentation/PredictionEntityPreview";
import type { BoltzComponent } from "./boltz-inputs";
import type { ScientificTask } from "./types";

export function boltzPreviewComponents(
  components: BoltzComponent[],
): PreviewComponent[] {
  return components.map((row) => ({
    kind: row.kind as PreviewComponent["kind"],
    value: row.value,
    count: 1,
    ligand_file: row.source?.asset_id,
    ligand_record: row.source?.record,
    chain_ids: [row.id],
  }));
}

export function boltzLigandRecordUrl(source: MoleculeRef) {
  return `/api/assets/${encodeURIComponent(source.asset_id)}?record=${source.record}`;
}

/** Validate the identities selected by the editor, without replacing their version or record. */
export async function prepareBoltzJob(
  task: ScientificTask,
  signal: AbortSignal,
) {
  const { payload } = task;
  if (task.operation !== "boltz_predict" || payload.kind !== "boltz")
    throw new Error("The reviewed request is not a Boltz-2 task.");
  const rows = payload.components as BoltzComponent[];
  const { inputs } = task;
  const files = new Map<string, Asset>();
  await Promise.all(
    [...new Set(inputs.map(({ source }) => source.asset_id))].map(
      async (id) => {
        const asset = await request<Asset>(
          `/assets/${encodeURIComponent(id)}/metadata`,
          {
            signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
          },
        );
        if (asset.id !== id || !/^[0-9a-f]{64}$/.test(asset.sha256))
          throw new Error("Could not verify the selected file.");
        files.set(id, asset);
      },
    ),
  );
  signal.throwIfAborted();
  for (const { role, source } of inputs) {
    const asset = files.get(source.asset_id);
    const suffixes = role === "ligand" ? [".sdf", ".mol"] : [".a3m", ".csv"];
    if (
      !asset ||
      asset.sha256 !== source.sha256 ||
      asset.kind !== role ||
      !suffixes.includes(asset.suffix) ||
      source.conformer !== 0
    )
      throw new Error(
        "The selected input file no longer matches the reviewed reference.",
      );
    if (role === "ligand") {
      if (
        !Number.isInteger(source.record) ||
        source.record < 0 ||
        source.record > 499
      )
        throw new Error("Choose a supported molecular record.");
      const record = await fetch(boltzLigandRecordUrl(source), {
        signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
      });
      const matches =
        record.ok &&
        record.headers.get("X-Structure-Record") === String(source.record);
      await record.body?.cancel();
      if (!matches)
        throw new Error("The selected molecular record could not be verified.");
    }
  }
  signal.throwIfAborted();
  return { task, rows, files, components: boltzPreviewComponents(rows) };
}

export type PreparedBoltzJob = Awaited<ReturnType<typeof prepareBoltzJob>>;
