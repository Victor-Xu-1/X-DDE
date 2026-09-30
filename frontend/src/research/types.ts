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
  kind: ObjectKind | "file" | "task";
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
  molecule: ["分子", "Molecule"],
  structure: ["结构", "Structure"],
  sequence: ["序列", "Sequence"],
  analysis: ["分析结果", "Analysis"],
  pocket: ["口袋", "Pocket"],
  file: ["原始文件", "Source file"],
  task: ["任务", "Task"],
};
export const edgeLabels: Record<string, [string, string]> = {
  represented_by: ["登记为", "Registered as"],
  used_as_input: ["用作输入", "Used as input"],
  produced: ["生成", "Produced"],
  edited_from: ["修改为", "Edited into"],
  prepared_from: ["准备为", "Prepared into"],
  derived_from: ["派生为", "Derived into"],
  continued_as: ["继续执行", "Continued as"],
};
