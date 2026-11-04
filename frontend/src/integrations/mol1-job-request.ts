import { request } from "../api";
import type { Asset, CovalentBond } from "../operations/types";
import type { Component } from "../types";
import type { Mol1Settings } from "./mol1-settings";
import type { ScientificTask } from "./types";

export interface Mol1JobInput {
  name: string;
  components: Component[];
  settings: Mol1Settings;
  bonds: CovalentBond[];
  device: "cpu" | "cuda";
  memory: number;
  seed: number;
}

const referenceFields = [
  ["ligand_file", "ligand"],
  ["source_sequence", "sequence"],
  ["paired_msa", "msa"],
  ["unpaired_msa", "msa"],
  ["template_hits", "template"],
] as const;

export async function prepareMol1Job(input: Mol1JobInput, signal: AbortSignal) {
  const { name, components, settings, bonds, device, memory, seed } =
    structuredClone(input);
  const references = new Map<
    string,
    ScientificTask["inputs"][number]["role"]
  >();
  for (const component of components)
    for (const [field, role] of referenceFields) {
      const id = component[field];
      if (!id) continue;
      if (references.has(id) && references.get(id) !== role)
        throw new Error("A research file is selected for incompatible roles.");
      references.set(id, role);
    }

  const files = await Promise.all(
    [...references].map(async ([id, role]) => {
      const asset = await request<Asset>(
        `/assets/${encodeURIComponent(id)}/metadata`,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) },
      );
      if (asset.id !== id || !/^[0-9a-f]{64}$/.test(asset.sha256))
        throw new Error("Could not verify the selected input.");
      return {
        name: asset.name,
        input: {
          role,
          source: {
            asset_id: id,
            sha256: asset.sha256,
            record: 0,
            conformer: 0,
            version_id: null,
          },
        },
      };
    }),
  );
  signal.throwIfAborted();
  const inputs = files.map((file) => file.input);
  const task: ScientificTask = {
    operation: "mol1_predict",
    name: name.trim() || "Mol-1 complex prediction",
    inputs,
    scientific_inputs: inputs.map((item) => item.source),
    payload: { ...settings, components, covalent_bonds: bonds },
    options: { device, cpu: 2, memory_mib: memory, seed },
  };
  return { task, files, components, settings, bonds };
}

export type PreparedMol1Job = Awaited<ReturnType<typeof prepareMol1Job>>;
