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
it("shows scientific downloads without internal engineering files", () => {
  render(
    <TaskDetail
      job={job}
      detail={{
        id: "abc",
        artifacts: [
          { name: "result/a b.cif", size: 100 },
          { name: "manifest.json", size: 100 },
          { name: "stdout.log", size: 100 },
          { name: "runtime-lock.csv", size: 100 },
        ],
      }}
      failed={false}
      language="en"
      onChange={vi.fn()}
    />,
  );
  expect(
    screen.queryByText(/manifest.json|stdout.log|runtime-lock.csv/),
  ).toBeNull();
  expect(screen.queryByRole("heading", { name: /Logs|输入摘要/ })).toBeNull();
  expect(screen.queryByRole("link", { name: /Input JSON/ })).toBeNull();
  expect(document.querySelector("script")).toBeNull();
  expect(
    screen.getByRole("link", { name: "3D structure · CIF" }),
  ).toHaveAttribute("href", "/api/jobs/abc/download?name=result%2Fa+b.cif");
});
it("never shows artifacts belonging to the previous selection", () => {
  render(
    <TaskDetail
      job={job}
      detail={{
        id: "other",
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
