import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Job } from "../types";
import type { TaskRequest } from "./types";

export function useTaskSubmit(onCreated: (job: Job) => void) {
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<{
      message: string;
      unconfirmed?: boolean;
    } | null>(null);
  const request = useRef<{ body: string; key: string; accepted?: Job }>({
    body: "",
    key: crypto.randomUUID(),
  });
  const pending = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(value: TaskRequest) {
    if (pending.current) return;
    const body = JSON.stringify(value);
    if (request.current.body !== body)
      request.current = { body, key: crypto.randomUUID() };
    const intent = request.current;
    const snapshot = JSON.parse(body) as TaskRequest;
    pending.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const job = intent.accepted ?? (await api.submit(snapshot, intent.key));
      intent.accepted = job;
      if (!mounted.current) return job;
      try {
        onCreated(job);
        request.current = { body: "", key: crypto.randomUUID() };
      } catch (error) {
        console.warn("Accepted task view could not be opened.", error);
        setFailure({
          message:
            "Task created, but its page could not be opened. Use the task link below.",
        });
      }
      return job;
    } catch (e) {
      if (mounted.current) {
        const unconfirmed =
          e instanceof TypeError ||
          (e instanceof DOMException &&
            ["TimeoutError", "AbortError"].includes(e.name));
        setFailure({
          unconfirmed,
          message: unconfirmed
            ? "Task submission could not be confirmed. Submit again to continue the same request."
            : e instanceof Error
              ? e.message
              : String(e),
        });
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function clearError({
    unconfirmedAfterEdit,
  }: { unconfirmedAfterEdit?: string } = {}) {
    // Editing a rejected input does not erase accepted-task navigation recovery.
    if (!pending.current && !request.current.accepted)
      setFailure((current) =>
        unconfirmedAfterEdit && current?.unconfirmed
          ? { ...current, message: unconfirmedAfterEdit }
          : null,
      );
  }
  return { busy, error: failure?.message ?? "", submit, clearError };
}
