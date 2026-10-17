import type { Asset } from "../operations/types";
import type { ToolId } from "../operations/catalog";
import { datasetTools } from "./catalog";
import { materialFor, taskFor } from "./dataset-model";
import type { PublicLibraryFile } from "./PublicLibraryFiles";
import type { InputPreview } from "./useTablePreview";
import type { AvailableDataset, DatasetTask } from "./types";

/** SDF properties and table headers describe the same actual identifier choices. */
export function libraryFields(
  preview: InputPreview,
  preferred?: { id_column?: unknown; smiles_column?: unknown },
) {
  const columns = preview.sdf_properties ?? preview.columns;
  const id =
    typeof preferred?.id_column === "string"
      ? preferred.id_column
      : (columns.find((column) =>
          /^(id|idnumber|compoundid|chemblid|molportid|catalogid|catalogno|catalognumber|catno|catnumber|code|cmpdid)$/i.test(
            column.replace(/[\s_-]/g, ""),
          ),
        ) ?? (preview.sdf_properties ? "_Name" : "ID"));
  const smiles =
    typeof preferred?.smiles_column === "string"
      ? preferred.smiles_column
      : (preview.columns.find((column) =>
          /^(smiles|smi|canonicalsmiles)$/i.test(column.replace(/[\s_-]/g, "")),
        ) ?? "SMILES");
  return { id, smiles };
}

export function validLibraryFields(
  preview: InputPreview | null,
  id: string,
  smiles: string,
) {
  if (!preview) return false;
  return preview.sdf_properties
    ? id === "_Name" || preview.sdf_properties.includes(id)
    : preview.table &&
        preview.columns.includes(id) &&
        preview.columns.includes(smiles);
}

interface LibraryDraft {
  tool: ToolId;
  asset: Asset | null;
  source: AvailableDataset[];
  publicResource: PublicLibraryFile | null;
  supplier: string;
  idColumn: string;
  smilesColumn: string;
  selected: string[];
  name: string;
  purpose: string;
  device: "cpu" | "cuda";
  template?: DatasetTask;
}

/** Serialize through the existing task authority, retaining reviewed scientific settings. */
export function libraryRequest(draft: LibraryDraft): DatasetTask {
  const {
    tool,
    asset,
    source,
    publicResource,
    supplier,
    idColumn,
    smilesColumn,
    selected,
    name,
    purpose,
    device,
    template,
  } = draft;
  const importing = tool === "library.import",
    indexing = tool === "drugclip.index";
  const saved =
    template?.operation ===
    datasetTools.find((item) => item.id === tool)?.operation
      ? template
      : undefined;
  const original = saved?.inputs.find(
    (item) =>
      item.role === "data" &&
      item.source.asset_id === asset?.id &&
      item.source.sha256 === asset.sha256,
  );
  const publicFile =
    asset &&
    publicResource?.asset?.id === asset.id &&
    publicResource.asset.sha256 === asset.sha256;
  const native: Partial<DatasetTask["payload"]> = structuredClone(
    saved?.payload ?? {},
  );
  const payload = indexing
    ? {
        ...native,
        kind: "drugclip" as const,
        mode: "index",
        use: "non_commercial",
      }
    : importing
      ? {
          ...native,
          kind: "chemistry" as const,
          mode: "prepare",
          supplier,
          library_name:
            native.library_name ?? (name.trim() || asset?.name || purpose),
          id_column: idColumn,
          smiles_column: smilesColumn,
          source_permission: publicFile
            ? "official_public_resource"
            : original
              ? (native.source_permission ?? "user_owned_file")
              : "user_owned_file",
          source_url: publicFile
            ? publicResource.source_page
            : original
              ? (native.source_url ?? "")
              : "",
          delimiter:
            original && native.delimiter !== undefined
              ? native.delimiter
              : asset?.suffix.includes(".tsv")
                ? "\t"
                : ",",
        }
      : {
          ...native,
          kind: "chemistry" as const,
          mode: "subset",
          selected_ids: [...selected],
          generate_conformers: native.generate_conformers ?? true,
        };
  return {
    ...taskFor(
      tool,
      payload,
      importing && asset
        ? [original ? structuredClone(original) : materialFor(asset, "data")]
        : [],
      importing ? [] : source,
      name.trim() || purpose,
      {
        cpu: 2,
        memory_mib: indexing ? 8192 : 4096,
        seed: 101,
        ...structuredClone(saved?.options ?? {}),
        device: indexing ? device : "cpu",
      },
    ),
    ...(saved?.output_bytes !== undefined
      ? { output_bytes: saved.output_bytes }
      : {}),
    ...(saved?.time_limit_seconds !== undefined
      ? { time_limit_seconds: saved.time_limit_seconds }
      : {}),
  };
}
