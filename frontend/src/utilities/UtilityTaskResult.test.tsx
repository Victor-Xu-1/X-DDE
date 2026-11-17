import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import { UtilityTaskResult } from "./UtilityTaskResult";

vi.mock("../operations/OperationResults", () => ({
  OperationResults: ({ job }: { job: Job }) => <p>Native output {job.id}</p>,
}));
afterEach(cleanup);
const accepted = {
  id: "stat6-tool",
  request: { operation: "properties" },
  status: "queued",
  error: null,
} as Job;
it("uses the same job's live platform status and native renderer", () => {
  const props = {
    accepted,
    active: true,
    language: "en" as const,
    onCreated: vi.fn(),
  };
  const { rerender } = render(<UtilityTaskResult {...props} jobs={[]} />);
  expect(screen.queryByText("Native output stat6-tool")).toBeNull();
  rerender(
    <UtilityTaskResult
      {...props}
      jobs={[{ ...accepted, status: "succeeded" }]}
    />,
  );
  expect(screen.getByText("Native output stat6-tool")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Task details & downloads" }),
  ).toHaveAttribute("href", "/#task=stat6-tool");
  rerender(
    <UtilityTaskResult
      {...props}
      active={false}
      jobs={[{ ...accepted, status: "succeeded" }]}
    />,
  );
  expect(screen.queryByText("Native output stat6-tool")).toBeNull();
});
it("does not substitute another task's result or hide a failed status", () => {
  render(
    <UtilityTaskResult
      accepted={accepted}
      active
      language="en"
      onCreated={vi.fn()}
      jobs={[
        { ...accepted, id: "other", status: "succeeded" },
        { ...accepted, status: "failed", error: "Invalid molecule" },
      ]}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Invalid molecule");
  expect(screen.queryByText(/Native output/)).toBeNull();
});
