import type { Component } from "../types";
import { nativeHistory } from "./prediction-history-native";
import {
  addSettings,
  assetId,
  integer,
  object,
  reference,
  text,
  type HistoryEntity,
  type HistoryFile,
  type HistoryStudy,
} from "./prediction-history-types";

const kinds = new Set(["protein", "ligand", "rna", "dna", "ion"]);
const files = [
  ["source_sequence", "原始序列文件", "Source sequence file"],
  ["unpaired_msa", "单链 MSA", "Unpaired MSA"],
  ["paired_msa", "配对 MSA", "Paired MSA"],
  ["template_hits", "模板文件", "Template file"],
] as const;

function component(value: unknown, boltz: boolean): HistoryEntity | null {
  const row = object(value);
  if (
    !row ||
    typeof row.kind !== "string" ||
    !kinds.has(row.kind) ||
    !text(row.value)
  )
    return null;
  if (boltz && row.kind === "ion") return null;
  const count = boltz ? 1 : row.count;
  const rawValue = row.value;
  if (!integer(count, 1, 4)) return null;
  const chains = boltz ? [row.id] : row.chain_ids;
  if (
    chains !== undefined &&
    (!Array.isArray(chains) ||
      chains.length > 4 ||
      chains.some((id) => !text(id, 8) || !/^[A-Za-z0-9]+$/.test(id)) ||
      (chains.length > 0 && chains.length !== count) ||
      new Set(chains).size !== chains.length)
  )
    return null;
  const item: HistoryEntity = {
    component: {
      kind: row.kind as Component["kind"],
      value: row.value,
      count,
      ...(chains ? { chain_ids: chains as string[] } : {}),
    },
    files: [],
  };
  if (boltz) {
    for (const [key, zh, en] of [
      ["source", "原始分子文件", "Original molecular file"],
      ["msa", "单链 MSA", "Unpaired MSA"],
    ] as const) {
      if (row[key] == null) continue;
      const ref = reference(row[key]);
      if (
        !ref ||
        (key === "source"
          ? row.kind !== "ligand" || row.value !== ""
          : row.kind !== "protein")
      )
        return null;
      const file: HistoryFile = {
        label: [zh, en],
        id: ref.asset_id,
        reference: ref,
      };
      if (key === "source") {
        item.molecularFile = file;
        item.component.ligand_file = ref.asset_id;
        item.component.ligand_record = ref.record;
      } else item.files.push(file);
    }
    if (row.msa_mode === "single") {
      if (row.msa != null) return null;
      item.files.push({ label: ["仅单条序列", "Single sequence"] });
    }
  } else {
    for (const [key, zh, en] of files) {
      if (row[key] == null) continue;
      if (!assetId(row[key])) return null;
      item.files.push({ label: [zh, en], id: row[key] });
    }
    if (row.ligand_file != null) {
      if (
        !assetId(row.ligand_file) ||
        row.kind !== "ligand" ||
        row.value !== ""
      )
        return null;
      // This older component shape has a file, but no selected molecular record.
      item.molecularFile = {
        label: ["原始分子文件", "Original molecular file"],
        id: row.ligand_file,
      };
    }
    if (row.modifications != null) {
      if (!Array.isArray(row.modifications) || row.modifications.length > 100)
        return null;
      const modifications = row.modifications.map((value) => {
        const m = object(value);
        return m &&
          integer(m.position, 1, rawValue.length) &&
          text(m.ccd, 16) &&
          /^CCD_[A-Z0-9]+$/.test(m.ccd)
          ? { position: m.position, ccd: m.ccd }
          : null;
      });
      if (modifications.some((m) => !m)) return null;
      item.component.modifications =
        modifications as Component["modifications"];
    }
  }
  return item;
}

/** Read only what the document records. This projection is never an admission schema. */
export function historicalStudies(value: unknown): HistoryStudy[] | null {
  if (Array.isArray(value)) return nativeHistory(value);
  const request = object(value);
  if (!request) return null;
  const boltz = request.operation === "boltz_predict";
  const mol1 = request.operation === "mol1_predict";
  const payload = boltz || mol1 ? object(request.payload) : request;
  if (
    !payload ||
    (boltz && payload.kind !== "boltz") ||
    (mol1 && payload.kind !== "mol1") ||
    (!boltz && !mol1 && request.operation !== "predict") ||
    !Array.isArray(payload.components) ||
    !payload.components.length ||
    payload.components.length > 8
  )
    return null;
  const entities = payload.components.map((value) => component(value, boltz));
  if (entities.some((item) => !item)) return null;
  if (mol1 && Array.isArray(request.inputs) && request.inputs.length > 64)
    return null;
  // Mol-1's component IDs are associated only with exact references present in this same request.
  if (mol1 && Array.isArray(request.inputs))
    for (const entity of entities as HistoryEntity[]) {
      for (const file of [
        ...entity.files,
        ...(entity.molecularFile ? [entity.molecularFile] : []),
      ]) {
        const matches = request.inputs
          .map(object)
          .filter(
            (input) => input && object(input.source)?.asset_id === file.id,
          );
        if (!matches.length) continue;
        const refs = matches.map((input) => reference(input!.source));
        if (
          refs.some((ref) => !ref) ||
          new Set(refs.map((ref) => JSON.stringify(ref))).size !== 1
        )
          return null;
        file.reference = refs[0]!;
        if (file === entity.molecularFile) {
          if (matches.some((input) => input!.role !== "ligand")) return null;
          entity.component.ligand_file = file.id;
          entity.component.ligand_record = file.reference.record;
        }
      }
    }
  const study: HistoryStudy = {
    entities: entities as HistoryEntity[],
    settings: [
      {
        label: ["预测模型", "Prediction model"],
        value: boltz
          ? "Boltz-2"
          : mol1
            ? "Mol-1"
            : object(request.parameters)?.model === "abag"
              ? "OpenDDE ABAG"
              : "OpenDDE",
      },
    ],
  };
  const parameters = boltz || mol1 ? payload : object(request.parameters);
  if (parameters) {
    addSettings(study, parameters, [
      ["seed", "随机种子", "Seed"],
      ["samples", "请求构象", "Requested structures"],
      ["cycles", "循环次数", "Recycling steps"],
      ["recycling_steps", "循环次数", "Recycling steps"],
      ["steps", "采样步数", "Sampling steps"],
      ["sampling_steps", "采样步数", "Sampling steps"],
      ["affinity", "模型亲和力预测", "Model affinity prediction"],
      ["dtype", "数值精度", "Precision"],
      ["feature_mode", "序列特征模式", "Sequence feature mode"],
    ]);
    if (
      Array.isArray(parameters.additional_seeds) &&
      parameters.additional_seeds.length <= 7 &&
      parameters.additional_seeds.every((seed) => integer(seed, 0, 2147483647))
    )
      study.settings.push({
        label: ["其他随机种子", "Additional seeds"],
        value: parameters.additional_seeds.join(", ") || "—",
      });
  }
  const options = object(request.options);
  if (options)
    addSettings(study, options, [
      ["seed", "随机种子", "Seed"],
      ["device", "计算设备", "Compute device"],
    ]);
  if (Array.isArray(payload.covalent_bonds))
    study.settings.push({
      label: ["共价连接", "Covalent bonds"],
      value: payload.covalent_bonds.length,
    });
  return [study];
}
