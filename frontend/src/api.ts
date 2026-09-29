import type {
  Analysis,
  Artifact,
  Health,
  Job,
  Prediction,
  Project,
} from "./types";

let csrf = "";
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30000),
  });
  const payload = await response.json();
  if (!response.ok) {
    const detail = payload.detail;
    throw new Error(
      Array.isArray(detail)
        ? detail.map((item: { msg: string }) => item.msg).join("\n")
        : String(detail ?? response.status),
    );
  }
  return payload as T;
}
export const api = {
  async initialize() {
    const session = await request<{ csrf_token: string }>("/session");
    csrf = session.csrf_token;
  },
  jobs: (signal?: AbortSignal) => request<Job[]>("/jobs", { signal }),
  health: (signal?: AbortSignal) => request<Health>("/health", { signal }),
  logs: (id: string, signal?: AbortSignal) =>
    request<{ text: string; truncated: boolean }>(`/jobs/${id}/logs`, {
      signal,
    }),
  artifacts: (id: string, signal?: AbortSignal) =>
    request<Artifact[]>(`/jobs/${id}/artifacts`, { signal }),
  analysis: (id: string, signal?: AbortSignal) =>
    request<Analysis>(`/jobs/${id}/analysis`, { signal }),
  projects: (signal?: AbortSignal) =>
    request<Project[]>("/projects", { signal }),
  async createProject(name: string, description = "") {
    await api.initialize();
    return request<Project>("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Workbench-CSRF": csrf },
      body: JSON.stringify({ name, description }),
    });
  },
  async mutate(path: string, key: string, body: unknown = {}) {
    await api.initialize();
    return request<Job>(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Workbench-CSRF": csrf,
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body),
    });
  },
  submit: (value: Prediction, key: string) => api.mutate("/jobs", key, value),
  retry: (id: string, key: string) => api.mutate(`/jobs/${id}/retry`, key),
  cancel: (id: string) => api.mutate(`/jobs/${id}/cancel`, crypto.randomUUID()),
};

export const artifactUrl = (id: string, name: string) =>
  `/api/jobs/${encodeURIComponent(id)}/download?${new URLSearchParams({ name })}`;
