import { request } from "../api";
import type { MoleculeRef } from "../research/types";
import { acceptedAsset, assetFormats } from "./asset-acceptance";
import { harnessFileFields } from "./harness-generated";
import type { Asset } from "./types";

const fileFields = new Set<string>(harnessFileFields);
const fileId = /^asset:([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/;

/** Follow the native file contract, not UUID-looking names or commentary. */
export function harnessAssetIds(payload: Record<string, unknown>): string[] {
  const identifiers = new Set<string>();
  function visit(value: unknown, key = "", depth = 0) {
    if (depth > 16) throw new Error("Input nesting exceeds the native limit.");
    if (fileFields.has(key)) {
      if (value === "" || value === undefined) return;
      for (const item of Array.isArray(value) ? value : [value]) {
        const match = typeof item === "string" ? fileId.exec(item) : null;
        if (!match)
          throw new Error("Choose an uploaded file for each file input.");
        identifiers.add(match[1]);
        if (identifiers.size > 64)
          throw new Error("Use at most 64 input files.");
      }
    } else if (Array.isArray(value)) {
      if (value.length > 10000)
        throw new Error("Input collection exceeds the native limit.");
      for (const item of value) visit(item, "", depth + 1);
    } else if (value && typeof value === "object") {
      for (const [name, item] of Object.entries(value))
        visit(item, name, depth + 1);
    }
  }
  visit(payload);
  return [...identifiers];
}

export async function resolveHarnessSources(
  ids: readonly string[],
  retained: readonly MoleculeRef[],
  signal: AbortSignal,
) {
  const assets = await Promise.all(
    ids.map(async (id) => {
      const asset = await request<Asset>(
        `/assets/${encodeURIComponent(id)}/metadata`,
        { signal },
      );
      signal.throwIfAborted();
      if (
        !Object.hasOwn(assetFormats, asset.kind) ||
        !acceptedAsset(
          asset,
          id,
          asset.kind,
          assetFormats[asset.kind],
          25 * 1024 ** 2,
        )
      )
        throw new Error(
          "Scientific input metadata does not match the selected file.",
        );
      const existing = retained.filter(
        (reference) => reference.asset_id === id,
      );
      if (
        existing.some(
          (reference) =>
            reference.sha256 !== asset.sha256 ||
            reference.record !== 0 ||
            reference.conformer !== 0,
        )
      )
        throw new Error(
          "The selected whole-file input differs from its retained scientific reference.",
        );
      return asset;
    }),
  );
  signal.throwIfAborted();
  const references = [...retained];
  for (const asset of assets) {
    if (!references.some((reference) => reference.asset_id === asset.id))
      references.push({
        asset_id: asset.id,
        sha256: asset.sha256,
        record: 0,
        conformer: 0,
        version_id: null,
      });
  }
  const seen = new Set<string>();
  return {
    assets,
    references: references.filter((reference) => {
      const key = JSON.stringify(reference);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}
