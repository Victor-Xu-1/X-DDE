export interface MoleculeRef {
  asset_id: string;
  sha256: string;
  record: number;
  conformer: number;
  version_id?: string | null;
}
export type ObjectKind =
  "molecule" | "structure" | "sequence" | "analysis" | "pocket";
export interface ScientificObject {
  id: string;
  family_id: string;
  kind: ObjectKind;
  label: string;
  reference: MoleculeRef;
  parent_id: string | null;
  relation: "derived_from" | "prepared_from" | "edited_from";
  notes: string;
  rating: number;
  source_job: string | null;
  created_at: string;
  validation: string;
}
export interface GraphNode {
  id: string;
  kind:
    | ObjectKind
    | "file"
    | "task"
    | "plan"
    | "run"
    | "region"
    | "constraint"
    | "molecular_state_set"
    | "receptor_ensemble"
    | "binding_site_set"
    | "pose_exploration"
    | "pose_ensemble"
    | "pose_score_comparison";
  label: string;
  asset_id?: string;
  asset_kind?: string;
  format?: string;
  job_id?: string;
  status?: string;
  operation?: string;
  object?: ScientificObject;
  exploration_id?: string;
  plan_id?: string;
  pose_set_id?: string;
}
export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}
export interface ResearchGraph {
  schema: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
  limit: number;
}
export const objectLabels: Record<string, [string, string]> = {
  molecular_state_set: ["分子状态集合", "Molecular state set"],
  receptor_ensemble: ["受体构象集合", "Receptor ensemble"],
  binding_site_set: ["跨构象位点", "Cross-conformation sites"],
  pose_exploration: ["姿势探索计划", "Pose exploration"],
  pose_ensemble: ["结合姿势集合", "Pose ensemble"],
  pose_score_comparison: ["姿势评分比较", "Pose score comparison"],
  molecule: ["分子", "Molecule"],
  structure: ["结构", "Structure"],
  sequence: ["序列", "Sequence"],
  analysis: ["分析结果", "Analysis"],
  pocket: ["口袋", "Pocket"],
  file: ["原始文件", "Source file"],
  task: ["任务", "Task"],
  plan: ["研究计划", "Research plan"],
  run: ["计划运行", "Research run"],
  constraint: ["任务条件", "Task conditions"],
  region: ["分子区域", "Molecular regions"],
};
export const edgeLabels: Record<string, [string, string]> = {
  pose_score_comparison: ["同条件评分比较", "Equal-condition score comparison"],
  compared_pose: ["参与比较的姿势", "Compared pose"],
  pose_site_selection: ["探索位点", "Explored sites"],
  planned_pose_exploration: ["姿势计划", "Pose plan"],
  pose_ligand_input: ["探索分子", "Exploration ligand"],
  pose_state_input: ["状态依据", "State evidence"],
  captured_pose_exploration: ["保存姿势", "Captured poses"],
  native_pose_evidence: ["原生运行依据", "Native run evidence"],
  pose_attempt: ["姿势尝试", "Pose attempt"],
  produced_collection: ["产生集合", "Produced collection"],
  contains: ["包含成员", "Contains member"],
  aligned_from: ["对齐来源", "Aligned from"],
  site_association: ["关联位点", "Associated sites"],
  pocket_evidence: ["口袋依据", "Pocket evidence"],
  aligned_site_context: ["位点受体", "Site receptor"],
  constrained_input: ["约束参照", "Constraint reference"],
  constraint_selection: ["约束选区", "Constraint selection"],
  revised_conditions: ["修改条件为", "Revised conditions"],
  planned_conditions: ["计划条件", "Planned conditions"],
  used_conditions: ["使用条件", "Used conditions"],
  represented_by: ["登记为", "Registered as"],
  selected_region: ["选定区域", "Selected region"],
  identity_evidence: ["原子身份依据", "Atom identity evidence"],
  revised_regions: ["修改区域为", "Revised regions"],
  planned_input: ["计划输入", "Planned input"],
  executed_as: ["运行", "Executed as"],
  executed_step: ["执行步骤", "Executed step"],
  used_as_input: ["用作输入", "Used as input"],
  used_property_model: ["使用研究模型", "Uses research model"],
  produced: ["生成", "Produced"],
  edited_from: ["修改为", "Edited into"],
  prepared_from: ["准备为", "Prepared into"],
  derived_from: ["派生为", "Derived into"],
  continued_as: ["继续执行", "Continued as"],
};
