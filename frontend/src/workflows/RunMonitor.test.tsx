import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RunMonitor } from "./RunMonitor";
import type { WorkflowRun } from "./types";
import * as client from "../api";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("bounds failed polling and allows explicit recovery to the real terminal response", async () => {
  vi.useFakeTimers();
  const initial: WorkflowRun = {
    id: "run",
    plan_id: "plan",
    state: "running",
    reason: null,
    created_at: "2026-10-01T00:00:00+00:00",
    attempts: [],
  };
  const read = vi
    .spyOn(client, "request")
    .mockRejectedValue(new Error("network unavailable"));
  render(<RunMonitor initial={initial} language="en" />);
  for (const delay of [1500, 3000, 6000])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(delay);
    });
  expect(read).toHaveBeenCalledTimes(3);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(read).toHaveBeenCalledTimes(3);
  expect(screen.getByRole("alert")).toHaveTextContent("network unavailable");
  read.mockResolvedValue({ ...initial, state: "succeeded" });
  fireEvent.click(screen.getByRole("button", { name: "Reload run status" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(read).toHaveBeenCalledTimes(4);
  expect(screen.getByRole("heading", { name: "Succeeded" })).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(read).toHaveBeenCalledTimes(4);
});
