/** Editor persistence only; task validation and scientific readiness stay native. */
export type DraftTool = "mol1.predict" | "boltz.predict" | "predict";
export interface DraftSummary<Tool extends DraftTool = DraftTool> {
  id: string;
  tool: Tool;
  schema_version: 1;
  revision: number;
  name: string;
  entities: number;
  created_at: string;
  updated_at: string;
  archived: boolean;
}
export interface DraftRecord<
  State,
  Tool extends DraftTool = DraftTool,
> extends DraftSummary<Tool> {
  state: State;
}
export interface DraftAdapter<State, Tool extends DraftTool> {
  tool: Tool;
  model: string;
  readState(value: unknown): State;
  readDraft(value: unknown): DraftRecord<State, Tool>;
}
export interface DraftEditorState {
  name: string;
  components: unknown[];
}
export const draftToolQuery = (tool: DraftTool) =>
  tool === "mol1.predict" ? "" : "?tool=" + tool;
export const draftRecord = <State, Tool extends DraftTool>(
  value: unknown,
  tool: Tool,
  readState: (value: unknown) => State,
): DraftRecord<State, Tool> => {
  if (!value || typeof value !== "object")
    throw new Error("Invalid prediction draft.");
  const row = value as DraftRecord<unknown, Tool>;
  if (
    row.tool !== tool ||
    row.schema_version !== 1 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      row.id,
    ) ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    typeof row.archived !== "boolean" ||
    typeof row.name !== "string" ||
    row.name.length > 80 ||
    !Number.isSafeInteger(row.entities) ||
    row.entities < 0 ||
    row.entities > 32 ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  )
    throw new Error(
      "This draft belongs to another model or uses an unsupported format. Your current inputs were retained.",
    );
  return { ...row, state: readState(row.state) };
};
