import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TaskDetail } from "./TaskDetail";
import { defaults } from "./form-model";
import type { Job } from "./types";

const job: Job = {
  id: "abc",
  request: {
    name: "test",
    components: [{ kind: "ligand", value: "CCO", count: 1 }],
    parameters: defaults,
  },
  status: "succeeded",
  created_at: "2026-01-01T00:00:00Z",
  started_at: null,
  finished_at: null,
  error: null,
  parent_id: null,
};
it("shows an honest empty state", () => {
  render(
    <TaskDetail
      job={null}
      detail={null}
      failed={false}
      language="en"
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByText("Select a task to inspect")).toBeVisible();
});
it("preserves raw logs as text and builds a contained download URL", () => {
  render(
    <TaskDetail
      job={job}
      detail={{
        id: "abc",
        log: { text: "<script>alert(1)</script>", truncated: false },
        artifacts: [{ name: "result/a b.cif", size: 100 }],
      }}
      failed={false}
      language="en"
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByText("<script>alert(1)</script>")).toBeVisible();
  expect(document.querySelector("script")).toBeNull();
  expect(screen.getByRole("link", { name: /result\/a b.cif/ })).toHaveAttribute(
    "href",
    "/api/jobs/abc/download?name=result%2Fa+b.cif",
  );
});
it("never shows artifacts belonging to the previous selection", () => {
  render(
    <TaskDetail
      job={job}
      detail={{
        id: "other",
        log: { text: "stale text", truncated: false },
        artifacts: [{ name: "wrong.cif", size: 100 }],
      }}
      failed={true}
      language="en"
      onChange={vi.fn()}
    />,
  );
  expect(screen.queryByText("stale text")).toBeNull();
  expect(screen.queryByText("wrong.cif")).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("Connection failed");
});
