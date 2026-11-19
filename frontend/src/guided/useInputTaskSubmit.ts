import type { Job } from "../types";
import type { TaskRequest } from "../operations/types";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { useInputActionScope } from "./InputActionScope";

/** Keep native submission/idempotency while protecting an explicitly scoped input. */
export function useInputTaskSubmit(onCreated: (job: Job) => void) {
  const scope = useInputActionScope();
  const task = useTaskSubmit(onCreated, scope?.onDetachedAccept);
  async function submit(value: TaskRequest) {
    const finish = scope?.begin("submission");
    if (scope && !finish) return;
    try {
      return await task.submit(value);
    } finally {
      finish?.();
    }
  }
  return { ...task, submit };
}
