import { useRef, useState } from "react";
import { api } from "../api";
import type { Job } from "../types";
import type { TaskRequest } from "./types";

export function useTaskSubmit(onCreated: (job: Job) => void) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef({ body: "", key: crypto.randomUUID() });
  async function submit(value: TaskRequest) {
    if (busy) return;
    const body = JSON.stringify(value);
    if (request.current.body !== body)
      request.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const job = await api.submit(value, request.current.key);
      request.current = { body: "", key: crypto.randomUUID() };
      onCreated(job);
      return job;
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, submit };
}
