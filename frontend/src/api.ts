import type { Analysis, Artifact, Health, Job, Project } from "./types";
import type {
  Asset,
  AssetKind,
  OperationResult,
  TaskRequest,
} from "./operations/types";

let csrf = "";
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => {
    throw new Error(`HTTP ${response.status}: invalid server response`);
  });
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
  async authorized<T>(path: string, init: RequestInit): Promise<T> {
    await api.initialize();
    const headers = new Headers(init.headers);
    headers.set("X-Workbench-CSRF", csrf);
    return request<T>(path, { ...init, headers });
  },
  async post<T>(
    path: string,
    body: unknown,
    key: string = crypto.randomUUID(),
    timeoutMs = 30000,
  ): Promise<T> {
    await api.initialize();
    return request<T>(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Workbench-CSRF": csrf,
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  },
  assets: (signal?: AbortSignal) => request<Asset[]>("/assets", { signal }),
  async upload(file: File, kind: AssetKind): Promise<Asset> {
    if (file.size > 25 * 1024 ** 2) throw new Error("25 MiB maximum");
    await api.initialize();
    return request<Asset>(
      `/assets?${new URLSearchParams({ kind, name: file.name })}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Workbench-CSRF": csrf,
        },
        body: file,
        signal: AbortSignal.timeout(90000),
      },
    );
  },
  result: (id: string, signal?: AbortSignal) =>
    request<OperationResult>(`/jobs/${id}/result`, { signal }),
  async initialize() {
    const session = await request<{ csrf_token: string }>("/session");
    csrf = session.csrf_token;
  },
  jobs: (signal?: AbortSignal) => request<Job[]>("/jobs", { signal }),
  health: (signal?: AbortSignal) => request<Health>("/health", { signal }),
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
  submit: (value: TaskRequest, key: string) => api.mutate("/jobs", key, value),
  retry: (id: string, key: string) => api.mutate(`/jobs/${id}/retry`, key),
  cancel: (id: string) => api.mutate(`/jobs/${id}/cancel`, crypto.randomUUID()),
};

export const artifactUrl = (id: string, name: string) =>
  `/api/jobs/${encodeURIComponent(id)}/download?${new URLSearchParams({ name })}`;
