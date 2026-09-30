import type { Job } from "../types";
import type { WorkflowPlanInput, WorkflowStep } from "./types";
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
              result_field: "molecule_artifact",
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
