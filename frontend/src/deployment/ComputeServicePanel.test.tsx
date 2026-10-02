import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "../api";
import { ComputeServicePanel } from "./ComputeServicePanel";
import type { Deployment } from "./client";

const data = {
  compute_service: { configured: true, running: false, ready: false },
} as Deployment;
it("starts the managed service through its existing deployment API", () => {
  const execute = vi.fn(async (action: () => Promise<unknown>) => {
    await action();
  });
  const post = vi.spyOn(api, "post").mockResolvedValue({});
  render(
    <ComputeServicePanel
      data={data}
      zh={true}
      busy={false}
      execute={execute}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "启动计算服务" }));
  expect(post).toHaveBeenCalledWith(
    "/deployment/compute/start",
    {},
    undefined,
    120000,
  );
  expect(screen.getByRole("button", { name: "停止计算服务" })).toBeDisabled();
  post.mockRestore();
});
it("keeps an active native task protected from a stop click", () => {
  render(
    <ComputeServicePanel
      data={{
        ...data,
        compute_service: {
          configured: true,
          running: true,
          ready: true,
          active: 1,
        },
      }}
      zh={false}
      busy={false}
      execute={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Stop compute" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Tasks in progress");
});
it("requires installation before offering a service start", () => {
  render(
    <ComputeServicePanel
      data={{
        ...data,
        compute_service: { configured: false, running: false, ready: false },
      }}
      zh={true}
      busy={false}
      execute={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "启动计算服务" })).toBeDisabled();
});
