import { api, request } from "../api";
import type { Language } from "../types";
import type { TaskRequest } from "../operations/types";
import type { MoleculeRef } from "../research/types";
import type { SavedRegion } from "../regions/model";
import type {
  ConstraintReference,
  ConstraintSet,
  SavedConstraints,
  Support,
  OutputSettings,
} from "./types";

export async function listConstraints(
  subject: MoleculeRef,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({
    asset_id: subject.asset_id,
    record: String(subject.record),
    conformer: String(subject.conformer),
    limit: "200",
  });
  if (subject.version_id) query.set("version_id", subject.version_id);
  const all: SavedConstraints[] = [];
  for (let offset = 0; offset <= 10000; offset += 200) {
    query.set("offset", String(offset));
    const page = await request<SavedConstraints[]>(
      `/research/constraints?${query}`,
      { signal },
    );
    all.push(...page);
    if (page.length < 200) return all;
  }
  throw new Error(
    "Too many constraint versions. Narrow the molecular version selection.",
  );
}
export async function currentConditions(
  task: TaskRequest,
  name: string,
  parent: string | null,
  id: (key: string) => string,
  language: Language = "en",
): Promise<ConstraintSet> {
  const zh = language === "zh";
  if (
    task.operation === "docking" &&
    task.mode === "dock" &&
    task.search?.kind === "box"
  )
    return {
      schema_version: 1,
      name,
      subject: task.ligand,
      parent_id: parent,
      frame: {
        reference: task.receptor,
        basis: "reference_coordinates",
        unit: "angstrom",
      },
      conditions: [
        {
          id: id("search"),
          label: "Search box",
          kind: "search_box",
          strength: "hard",
          weight: null,
          scope: "target_a",
          phase: "input",
          source: "user_selection",
          validator: "exact_native_search_box",
          box: task.search.box,
        },
      ],
    };
  if (
    task.operation === "diffsbdd" &&
    task.payload.mode === "inpaint" &&
    typeof task.payload.saved_regions === "string"
  ) {
    const regions = await request<SavedRegion>(
      "/research/regions/" + task.payload.saved_regions,
    );
    const selected = regions.body.regions.filter(
      (r) => r.role === "fixed_core",
    );
    if (!selected.length)
      throw new Error(
        zh
          ? "请先保存至少一个固定核心区域，再保存任务条件。"
          : "Save at least one fixed core before saving conditions.",
      );
    return {
      schema_version: 1,
      name,
      subject: regions.body.subject,
      frame: null,
      parent_id: parent,
      conditions: selected.map((r) => ({
        id: id(r.name),
        label: r.name,
        kind: "fixed_region",
        strength: "hard",
        weight: null,
        scope: "subject",
        phase: "sampling",
        source: "user_selection",
        validator: "exact_native_indices",
        region_id: regions.id,
        region_name: r.name,
      })),
    };
  }
  throw new Error(
    zh
      ? "请先保存固定区域，或在受体坐标系中指定搜索范围。"
      : "Save native fixed regions or define an explicit receptor-frame search box first.",
  );
}
export const reasons: Record<string, [string, string]> = {
  output_bounds: [
    "计算结束后独立检查空间条件；不参与搜索引导",
    "Independent output bounds check; no search guidance",
  ],
  native_fixed: [
    "原生局部重设计保留所选原子",
    "Native inpainting retains the selected atoms",
  ],
  native_box: [
    "原生搜索使用这个范围；不代表所有结果原子都在范围内",
    "Native search uses these bounds; this does not confine every output atom",
  ],
  wrong_subject: [
    "分子版本不同，请重新选择条件",
    "Different molecule version; reselect conditions",
  ],
  wrong_frame: [
    "受体或坐标参照不同，请重新确认",
    "Different receptor/frame; reconfirm coordinates",
  ],
  wrong_scope: [
    "当前引擎不支持这个作用范围",
    "This engine does not support this scope",
  ],
  soft_unsupported: [
    "当前引擎不能应用软权重，不会自动放宽",
    "This engine cannot apply soft weights; no implicit relaxation",
  ],
  wrong_engine: [
    "这个任务类型不能执行该条件",
    "This task type cannot execute this condition",
  ],
  different_parameters: [
    "当前参数与保存的条件不同，请应用条件或保存新版本",
    "Current parameters differ; apply conditions or save a new revision",
  ],
  missing_selection: [
    "保存的区域中没有这个选区",
    "The named selection is absent from the saved region set",
  ],
};
export async function withConstraints(
  value: TaskRequest,
  reference: ConstraintReference | null,
  language: Language,
  outputChoice?: "none" | "heavy_atom_centroid" | "all_heavy_atoms",
  outputSettings?: OutputSettings,
): Promise<TaskRequest> {
  if (!reference) {
    if (outputChoice && outputChoice !== "none")
      throw new Error(
        language === "zh"
          ? "请先保存所选结果检查的条件版本。"
          : "Save the selected output check as a condition revision first.",
      );
    return value;
  }
  const body = { ...value, constraints: reference };
  const support = await api.post<Support>("/research/constraint-support", {
    reference,
    request: body,
  });
  if (!support.executable)
    throw new Error(
      support.conditions
        .filter((c) => !c.supported)
        .map(
          (c) =>
            reasons[c.reason_code]?.[language === "zh" ? 0 : 1] ?? c.reason,
        )
        .join("; "),
    );
  if (outputChoice !== undefined) {
    const checks = support.document.conditions.filter(
      (c) => c.kind === "spatial_bounds",
    );
    if (
      (outputChoice === "none" && checks.length > 0) ||
      (outputChoice !== "none" &&
        (!checks.length ||
          checks.some(
            (c) => c.kind !== "spatial_bounds" || c.selection !== outputChoice,
          )))
    )
      throw new Error(
        language === "zh"
          ? "结果检查选择与保存的条件不同；请应用条件或保存新版本。"
          : "Output choices differ from the saved conditions; apply them or save a new revision.",
      );
  }
  if (
    outputChoice &&
    outputChoice !== "none" &&
    outputSettings &&
    support.document.conditions.some(
      (c) =>
        c.kind === "spatial_bounds" &&
        (c.strength !== outputSettings.strength ||
          c.tolerance_angstrom !== outputSettings.tolerance_angstrom ||
          c.weight !==
            (outputSettings.strength === "soft"
              ? outputSettings.weight
              : null)),
    )
  )
    throw new Error(
      language === "zh"
        ? "结果检查参数与保存版本不同，请应用条件或保存新版本。"
        : "Output check settings differ from the saved revision; apply it or save a new revision.",
    );
  return body;
}
