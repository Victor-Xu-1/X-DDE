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
    | "binding_site_set";
  label: string;
  asset_id?: string;
  asset_kind?: string;
  format?: string;
  job_id?: string;
  status?: string;
  operation?: string;
  object?: ScientificObject;
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
  produced: ["生成", "Produced"],
  edited_from: ["修改为", "Edited into"],
  prepared_from: ["准备为", "Prepared into"],
  derived_from: ["派生为", "Derived into"],
  continued_as: ["继续执行", "Continued as"],
};
