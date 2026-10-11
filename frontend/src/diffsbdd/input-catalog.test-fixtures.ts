import type { Asset } from "../operations/types";
import type { ScientificObject } from "../research/types";
import type { InputCatalog, InputChoice } from "../research/input-catalog";
export function catalogFixture(
  versions: ScientificObject[] = [],
  files: Asset[] = [],
  selected = "",
): InputCatalog {
  const items: InputChoice[] = [
    ...files.map((asset) => ({
      key: "file:" + asset.id,
      origin: "upload" as const,
      label: asset.name,
      created_at: asset.created_at,
      asset,
      reference: {
        asset_id: asset.id,
        sha256: asset.sha256,
        record: 0,
        conformer: 0,
      },
      version: null,
    })),
    ...versions.map((version) => ({
      key: "version:" + version.id,
      origin: "saved" as const,
      label: version.label,
      created_at: version.created_at,
      version,
      reference: version.reference,
      asset: files.find((file) => file.id === version.reference.asset_id) ?? {
        id: version.reference.asset_id,
        name: version.label,
        sha256: version.reference.sha256,
        size: 100,
        kind:
          version.kind === "molecule"
            ? ("ligand" as const)
            : ("structure" as const),
        suffix: version.kind === "molecule" ? ".sdf" : ".pdb",
        created_at: version.created_at,
      },
    })),
  ];
  return {
    items,
    selected: items.find((item) => item.key === selected) ?? null,
    total: items.length,
    offset: 0,
    limit: 25,
  };
}
