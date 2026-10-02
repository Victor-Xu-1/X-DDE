import type { Job } from "../types";
import type { WorkflowPlanInput, WorkflowStep } from "./types";
function moleculeOutput(
  job: Job,
):
  | "molecule_artifact"
  | "pose_artifact"
  | "state_artifact"
  | "conformer_artifact" {
  const task = job.request;
  if (task.operation === "docking") return "pose_artifact";
  if (task.operation === "molecular_states")
    return task.options.conformers_per_state
      ? "conformer_artifact"
      : "state_artifact";
  if (
    task.operation === "diffsbdd" &&
    ["generate", "inpaint", "diversify", "optimize", "export"].includes(
      task.payload.mode,
    )
  )
    return "molecule_artifact";
  throw new Error("Choose a predecessor that declares real molecular outputs.");
}
export function planFromJobs(
  name: string,
  jobIds: string[],
  jobs: Job[],
  handoffs: Set<number>,
  hours: number,
): WorkflowPlanInput {
  if (!jobIds.length || jobIds.some((id) => !id) || jobIds.length > 30)
    throw new Error("Choose 1–30 real task templates.");
  const steps: WorkflowStep[] = jobIds.map((id, index) => {
    const job = jobs.find((j) => j.id === id);
    if (!job)
      throw new Error("Selected task template is missing. Reload tasks.");
    const request = structuredClone(job.request),
      stepId = `step_${index + 1}`;
    const depends = index ? [`step_${index}`] : [];
    if (handoffs.has(index) && (!index || request.operation !== "properties"))
      throw new Error(
        "Automatic molecular output handoff requires a properties task after another step.",
      );
    return {
      id: stepId,
      request,
      depends_on: depends,
      retries: 0,
      bindings: handoffs.has(index)
        ? [
            {
              from_step: `step_${index}`,
              target: "property_input",
              kind: "ligand",
              record: 0,
              result_field: moleculeOutput(
                jobs.find((j) => j.id === jobIds[index - 1])!,
              ),
            },
          ]
        : [],
    };
  });
  return {
    name: name.trim() || "Research plan",
    steps,
    budget: { max_jobs: steps.length, wall_seconds: Math.round(hours * 3600) },
  };
}
export const hasExternalCalls = (plan: WorkflowPlanInput | null) =>
  !!plan?.steps.some(
    (s) =>
      ("allow_external" in s.request && s.request.allow_external) ||
      ("allow_network" in s.request && s.request.allow_network) ||
      ("parameters" in s.request && !!s.request.parameters.allow_network),
  );
