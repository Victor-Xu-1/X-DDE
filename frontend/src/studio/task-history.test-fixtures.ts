import type { Job } from "../types";
import {
  kindForJob,
  type TaskHistoryPage,
  type TaskHistoryIdentity,
} from "./task-history-model";

/** Existing personal-job identity transport; no name heuristics or scientific data. */
export function identityFixture(job: Job): TaskHistoryIdentity {
  return {
    job_id: job.id,
    capability_id: kindForJob(job),
    origin: "research",
    example_cases: [],
  };
}

/** Component transport fixture; not scientific data or computed outputs. */
export function historyFixture(jobs: Job[], path: string): TaskHistoryPage {
  const params = new URLSearchParams(path.split("?")[1]);
  const capabilities = params.getAll("capability");
  const project = params.get("project_id"),
    status = params.get("status");
  const query = (params.get("q") ?? "").toLowerCase();
  const scoped = jobs.filter(
    (job) => !project || job.request.project_id === project,
  );
  const counts: TaskHistoryPage["counts"] = {};
  for (const job of scoped) {
    const count = (counts[kindForJob(job)] ??= { total: 0, active: 0 });
    count.total++;
    if (["queued", "running", "cancelling"].includes(job.status))
      count.active++;
  }
  const items = scoped
    .filter(
      (job) =>
        (!capabilities.length || capabilities.includes(kindForJob(job))) &&
        (!status || status === job.status) &&
        `${job.request.name} ${job.id}`.toLowerCase().includes(query),
    )
    .map((job) => ({ job, capability_id: kindForJob(job) }));
  const offset = Number(params.get("offset") ?? 0),
    limit = Number(params.get("limit") ?? 20);
  return {
    items: items.slice(offset, offset + limit),
    counts,
    total: items.length,
    offset,
    limit,
  };
}
