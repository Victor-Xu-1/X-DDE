import type { DatasetMaterial, DatasetSource, DatasetTask } from "./types";

/** Input-bound annotations may only follow the exact reviewed materials. */
export function retainedDELParameters(
  template: DatasetTask | undefined,
  operation: string,
  inputs: DatasetMaterial[],
  sources: DatasetSource[],
): Partial<DatasetTask["payload"]> {
  if (!template || template.operation !== operation) return {};
  const materials = (values: DatasetMaterial[]) =>
    values
      .map(({ role, label, source }) =>
        JSON.stringify([
          role,
          role === "reads" ? (label ?? "") : "",
          source.asset_id,
          source.sha256,
          source.record ?? 0,
          source.conformer ?? 0,
        ]),
      )
      .sort()
      .join("\n");
  const parents = (values: DatasetSource[]) =>
    values
      .map(({ role, job_id, report_sha256 }) =>
        JSON.stringify([role, job_id, report_sha256]),
      )
      .sort()
      .join("\n");
  return materials(template.inputs) === materials(inputs) &&
    parents(template.sources) === parents(sources)
    ? template.payload
    : {};
}

export interface DELExecution {
  options: DatasetTask["options"];
  time_limit_seconds: number;
  output_bytes: number;
}
export const defaultDELExecution = (): DELExecution => ({
  options: { device: "cpu", cpu: 2, memory_mib: 4096, seed: 101 },
  time_limit_seconds: 1800,
  output_bytes: 1024 ** 3,
});
export function executionForDEL(task: DatasetTask): DELExecution {
  return {
    options: { ...task.options },
    time_limit_seconds: task.time_limit_seconds ?? 86400,
    output_bytes: task.output_bytes ?? 50 * 1024 ** 3,
  };
}
export function validDELExecution(value: DELExecution) {
  const { cpu, memory_mib, seed, device } = value.options;
  return (
    device === "cpu" &&
    Number.isInteger(cpu) &&
    cpu >= 1 &&
    cpu <= 16 &&
    Number.isInteger(memory_mib) &&
    memory_mib >= 1024 &&
    memory_mib <= 65536 &&
    Number.isInteger(seed) &&
    seed >= 0 &&
    seed <= 2147483647 &&
    Number.isInteger(value.time_limit_seconds) &&
    value.time_limit_seconds >= 60 &&
    value.time_limit_seconds <= 604800 &&
    Number.isInteger(value.output_bytes) &&
    value.output_bytes >= 1024 ** 3 &&
    value.output_bytes <= 200 * 1024 ** 3
  );
}
