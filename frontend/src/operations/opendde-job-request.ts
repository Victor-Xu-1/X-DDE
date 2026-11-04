import { request } from "../api";
import { assetDownloadUrl } from "../research/asset-download";
import type { Prediction } from "../types";
import { acceptedAsset, assetFormats } from "./asset-acceptance";
import type { Asset } from "./types";

const componentFiles = {
  source_sequence: "sequences",
  ligand_file: "ligand",
  paired_msa: "msa",
  unpaired_msa: "msa",
  template_hits: "template",
} as const;

/** Verify inputs against the same asset roles as the prediction admission path. */
export async function prepareOpenDdeJob(task: Prediction, signal: AbortSignal) {
  const files = new Map<string, Asset>();
  const roles = new Map<
    string,
    (typeof componentFiles)[keyof typeof componentFiles]
  >();
  for (const component of task.components) {
    for (const [field, kind] of Object.entries(componentFiles)) {
      const id = component[field as keyof typeof componentFiles];
      if (!id) continue;
      if (roles.has(id) && roles.get(id) !== kind)
        throw new Error("An input file has conflicting roles.");
      roles.set(id, kind);
    }
  }
  const readSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  await Promise.all(
    [...roles].map(async ([id, kind]) => {
      const asset = await request<Asset>(
        `/assets/${encodeURIComponent(id)}/metadata`,
        {
          signal: readSignal,
        },
      );
      const sizeLimit = kind === "sequences" ? 200000 : 25 * 1024 ** 2;
      if (!acceptedAsset(asset, id, kind, assetFormats[kind], sizeLimit))
        throw new Error("The selected file does not match its input role.");
      files.set(id, asset);
    }),
  );
  for (const reference of task.scientific_inputs ?? []) {
    if (files.get(reference.asset_id)?.sha256 !== reference.sha256)
      throw new Error("The selected file no longer matches its saved source.");
  }
  await Promise.all(
    [...roles]
      .filter(([, kind]) => kind === "sequences")
      .map(async ([id]) => {
        const response = await fetch(assetDownloadUrl(id), {
          signal: readSignal,
        });
        if (!response.ok)
          throw new Error("The selected sequence file could not be read.");
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          await response.arrayBuffer(),
        );
        // Match Python's splitlines() in the server's FASTA admission check.
        const [header, ...lines] = text.split(
          /\r\n|[\n\r\u000b\u000c\u001c-\u001e\u0085\u2028\u2029]/u,
        );
        const sequence = lines
          .map((line) => line.trim())
          .join("")
          .toUpperCase();
        if (
          !header.startsWith(">") ||
          lines.some((line) => line.startsWith(">")) ||
          task.components.some(
            (component) =>
              component.source_sequence === id && component.value !== sequence,
          )
        )
          throw new Error(
            "The reviewed sequence differs from its selected source.",
          );
      }),
  );
  readSignal.throwIfAborted();
  return { task, components: task.components, files };
}

export type PreparedOpenDdeJob = Awaited<ReturnType<typeof prepareOpenDdeJob>>;
