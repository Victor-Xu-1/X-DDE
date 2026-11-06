import {
  integer,
  object,
  text,
  type HistoryEntity,
  type HistoryFile,
  type HistoryStudy,
} from "./prediction-history-types";

const kinds = {
  proteinChain: ["protein", "sequence"],
  dnaSequence: ["dna", "sequence"],
  rnaSequence: ["rna", "sequence"],
  ligand: ["ligand", "ligand"],
  ion: ["ion", "ion"],
} as const;

/** Only X-DDE's generated asset path grammar becomes a local download, never a supplied URL. */
function nativeFile(
  path: unknown,
  label: HistoryFile["label"],
): HistoryFile | null {
  if (!text(path, 1000) || !path) return null;
  const match =
    /^\/job\/assets\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.(?:a3m|csv|sdf|mol)$/.exec(
      path,
    );
  return { label, ...(match ? { id: match[1] } : {}) };
}
function entity(value: unknown): HistoryEntity | null {
  const item = object(value);
  if (!item || Object.keys(item).length !== 1) return null;
  const key = Object.keys(item)[0] as keyof typeof kinds;
  if (!Object.hasOwn(kinds, key)) return null;
  const data = object(item[key]);
  const [kind, field] = kinds[key];
  if (!data || !text(data[field]) || !integer(data.count, 1, 4)) return null;
  const chains = data.id;
  if (
    chains !== undefined &&
    (!Array.isArray(chains) ||
      chains.length !== data.count ||
      chains.some((id) => !text(id, 8) || !/^[A-Za-z0-9]+$/.test(id)) ||
      new Set(chains).size !== chains.length)
  )
    return null;
  const result: HistoryEntity = {
    component: {
      kind,
      value: data[field] as string,
      count: data.count,
      ...(chains ? { chain_ids: chains as string[] } : {}),
    },
    files: [],
  };
  if (kind === "ligand" && result.component.value.startsWith("FILE_")) {
    result.molecularFile =
      nativeFile(result.component.value.slice(5), [
        "原始分子文件",
        "Original molecular file",
      ]) ?? undefined;
    if (!result.molecularFile) return null;
    // No molecular record is recorded in this native format; do not guess record zero.
    result.component.value = "";
  }
  for (const [field, zh, en] of [
    ["unpairedMsaPath", "单链 MSA", "Unpaired MSA"],
    ["pairedMsaPath", "配对 MSA", "Paired MSA"],
    ["templatesPath", "模板文件", "Template file"],
  ] as const) {
    if (data[field] == null) continue;
    const file = nativeFile(data[field], [zh, en]);
    if (!file) return null;
    result.files.push(file);
  }
  if (data.modifications !== undefined) {
    if (!Array.isArray(data.modifications) || data.modifications.length > 100)
      return null;
    const modifications = data.modifications.map((raw) => {
      const m = object(raw);
      const position = m?.[kind === "protein" ? "ptmPosition" : "basePosition"];
      const ccd = m?.[kind === "protein" ? "ptmType" : "modificationType"];
      return integer(position, 1, result.component.value.length) &&
        text(ccd, 16) &&
        /^CCD_[A-Z0-9]+$/.test(ccd)
        ? { position, ccd }
        : null;
    });
    if (modifications.some((m) => !m)) return null;
    result.component.modifications = modifications as {
      position: number;
      ccd: string;
    }[];
  }
  return result;
}

export function nativeHistory(value: unknown): HistoryStudy[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 16) return null;
  const studies: HistoryStudy[] = [];
  for (const raw of value) {
    const data = object(raw);
    if (
      !data ||
      !Array.isArray(data.sequences) ||
      !data.sequences.length ||
      data.sequences.length > 8
    )
      return null;
    const entities = data.sequences.map(entity);
    if (entities.some((item) => !item)) return null;
    const study: HistoryStudy = {
      entities: entities as HistoryEntity[],
      settings: [],
    };
    if (
      Array.isArray(data.modelSeeds) &&
      data.modelSeeds.length &&
      data.modelSeeds.length <= 8 &&
      data.modelSeeds.every((seed) => integer(seed, 0, 2147483647))
    )
      study.settings.push({
        label: ["随机种子", "Seeds"],
        value: data.modelSeeds.join(", "),
      });
    if (Array.isArray(data.covalent_bonds))
      study.settings.push({
        label: ["共价连接", "Covalent bonds"],
        value: data.covalent_bonds.length,
      });
    studies.push(study);
  }
  return studies;
}
