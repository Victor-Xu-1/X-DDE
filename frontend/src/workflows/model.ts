import type { Job } from "../types";
import type { WorkflowPlanInput, WorkflowStep } from "./types";
import { poseGateChecks } from "../quality/generated";
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
  const steps: WorkflowStep[] = [];
  jobIds.forEach((id, index) => {
    const job = jobs.find((j) => j.id === id);
    if (!job)
      throw new Error("Selected task template is missing. Reload tasks.");
    const request = structuredClone(job.request),
      stepId = `step_${index + 1}`;
    const depends = index ? [`step_${index}`] : [];
    if (
      handoffs.has(index) &&
      (!index ||
        !["properties", "pose_quality"].includes(request.operation ?? ""))
    )
      throw new Error(
        "Automatic output handoff requires a properties or receptor-frame quality task after a molecular producer.",
      );
    const step: WorkflowStep = {
      id: stepId,
      request,
      depends_on: depends,
      retries: 0,
      bindings: [],
    };
    if (handoffs.has(index)) {
      let producerIndex = index - 1;
      const previous = steps[producerIndex];
      if (request.operation === "properties" && previous.quality_gate) {
        const binding = previous.bindings.find(
          (b) => b.target === "quality_molecule",
        );
        if (!binding)
          throw new Error(
            "The preceding quality step has no explicit docking producer.",
          );
        producerIndex = steps.findIndex((s) => s.id === binding.from_step);
        if (producerIndex < 0)
          throw new Error("The quality producer is missing.");
        step.depends_on = [...new Set([...depends, binding.from_step])];
      }
      const producer = jobs.find((j) => j.id === jobIds[producerIndex])!;
      const from = steps[producerIndex].id;
      if (request.operation === "pose_quality") {
        if (
          request.options.profile !== "dock" ||
          producer.request.operation !== "docking"
        )
          throw new Error(
            "Quality handoff requires a dock-profile quality task immediately after docking.",
          );
        step.bindings = [
          {
            from_step: from,
            target: "quality_molecule",
            kind: "ligand",
            record: 0,
            result_field: "pose_artifact",
          },
          {
            from_step: from,
            target: "quality_protein",
            kind: "structure",
            record: 0,
            result_field: "receptor_artifact",
          },
        ];
        step.quality_gate = { required_checks: [...poseGateChecks] };
      } else {
        step.bindings = [
          {
            from_step: from,
            target: "property_input",
            kind: "ligand",
            record: 0,
            result_field: moleculeOutput(producer),
          },
        ];
      }
    }
    steps.push(step);
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
