import type { ScientificTask } from "../integrations/types";

export type TernaryExecution = ScientificTask["options"];
export const defaultExecution: TernaryExecution = {
  device: "cpu",
  cpu: 2,
  memory_mib: 4096,
  seed: 31,
};
export function validExecution(value: TernaryExecution) {
  return (
    value.device === "cpu" &&
    Number.isInteger(value.cpu) &&
    value.cpu >= 1 &&
    value.cpu <= 4 &&
    Number.isInteger(value.memory_mib) &&
    value.memory_mib >= 4096 &&
    value.memory_mib <= 16384 &&
    Number.isInteger(value.seed) &&
    value.seed >= 0 &&
    value.seed <= 2147483647
  );
}
