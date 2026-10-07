import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { request } from "../api";
import { ClusterExample } from "./ClusterExample";
vi.mock("../api", () => ({ request: vi.fn() }));
vi.mock("../examples/ExampleJobResult", () => ({
  ExampleJobResult: ({ job }: { job: { id: string } }) => (
    <div>Native result: {job.id}</div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("opens the accepted fixed result with GET only and never submits a task", async () => {
  vi.mocked(request)
    .mockResolvedValueOnce({
      computed_result_available: true,
      pin: { job_id: "fixed-job" },
    })
    .mockResolvedValueOnce({ id: "fixed-job", status: "succeeded" });
  render(<ClusterExample language="zh" />);
  expect(await screen.findByText("Native result: fixed-job")).toBeVisible();
  expect(vi.mocked(request).mock.calls.map(([path]) => path)).toEqual([
    "/examples/pose.cluster",
    "/jobs/fixed-job",
  ]);
  expect(
    vi.mocked(request).mock.calls.every(([, options]) => !options?.method),
  ).toBe(true);
});

it("shows a concise installation action when the accepted case has not been installed", async () => {
  vi.mocked(request).mockResolvedValueOnce({
    computed_result_available: false,
    pin: null,
  });
  render(<ClusterExample language="zh" />);
  expect(
    await screen.findByText("请在安装与运行中安装公开分群案例。"),
  ).toBeVisible();
  expect(request).toHaveBeenCalledTimes(1);
});

it("does not expose internal diagnostics or start inference on unavailable data", async () => {
  vi.mocked(request).mockRejectedValueOnce(
    new Error("/internal/private-stack"),
  );
  render(<ClusterExample language="en" />);
  await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
  expect(screen.queryByText(/private-stack/)).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
});
