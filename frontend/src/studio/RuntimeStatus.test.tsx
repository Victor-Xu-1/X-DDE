import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Health } from "../types";
import { RuntimeStatus } from "./RuntimeStatus";

const health: Health = {
  version: "test",
  platform: { name: "X-DDE", ready: true },
  worker_ready: true,
  worker_error: null,
  engine: { ready: false, gpu: null, reason: "OpenDDE missing" },
  engines: {
    opendde: {
      id: "opendde",
      name: "OpenDDE",
      description: "结构预测 / Structures",
      execution_backend: "docker",
      operations: ["predict"],
      ready: false,
      reason: "OpenDDE missing",
    },
    diffsbdd: {
      id: "diffsbdd",
      name: "DiffSBDD",
      description: "分子设计 / Molecular design",
      execution_backend: "local_process",
      operations: ["diffsbdd"],
      ready: true,
      models: { model1: true, model2: false },
    },
    harness: {
      id: "harness",
      name: "OpenDDE Harness",
      description: "科学工具 / Scientific tools",
      execution_backend: "harness_process",
      operations: ["harness"],
      ready: true,
      compute_configured: false,
    },
  },
  free_disk_gib: 100,
  disk_total_gib: 200,
  capabilities: { prediction: true, msa: true, templates: true, llm: false },
};

it("shows an available X-DDE server independently of its scientific engines", () => {
  const setup = vi.fn();
  render(
    <RuntimeStatus
      language="zh"
      health={health}
      connectionError={false}
      onRefresh={vi.fn()}
      onSetup={setup}
    />,
  );
  expect(screen.getByRole("heading", { name: "X-DDE 平台后端" })).toBeVisible();
  expect(screen.getByText("平台服务就绪", { exact: true })).toBeVisible();
  const open = screen
    .getByRole("heading", { name: "OpenDDE · 集成环境" })
    .closest("article")!;
  const diff = screen
    .getByRole("heading", { name: "DiffSBDD · 集成环境" })
    .closest("article")!;
  expect(within(open).getByText("环境未就绪", { exact: true })).toBeVisible();
  expect(within(diff).getByText("环境检查通过", { exact: true })).toBeVisible();
  expect(
    within(diff).getByText("模型文件：1 / 2", { exact: true }),
  ).toBeVisible();
  expect(screen.queryByText("OpenDDE 后端", { exact: true })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "管理集成环境" }));
  expect(setup).toHaveBeenCalledOnce();
});

it("does not confuse the Harness client with its remote compute service", () => {
  render(
    <RuntimeStatus
      language="en"
      health={health}
      connectionError={false}
      onRefresh={vi.fn()}
      onSetup={vi.fn()}
    />,
  );
  const harness = screen
    .getByRole("heading", { name: "OpenDDE Harness · Integrated environment" })
    .closest("article")!;
  expect(
    within(harness).getByText("Client configured", { exact: true }),
  ).toBeVisible();
  expect(
    within(harness).getByText("Compute service not configured", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    screen.getByText("X-DDE platform server", { exact: true }),
  ).toBeVisible();
});

it("shows a loading state before the server responds", () => {
  render(
    <RuntimeStatus
      language="zh"
      health={null}
      connectionError={false}
      onRefresh={vi.fn()}
      onSetup={vi.fn()}
    />,
  );
  expect(screen.getByText("正在连接 X-DDE…", { exact: true })).toBeVisible();
  expect(screen.queryByText("平台服务就绪", { exact: true })).toBeNull();
});

it("marks stale readiness after disconnection and provides reconnect", () => {
  const refresh = vi.fn();
  render(
    <RuntimeStatus
      language="en"
      health={health}
      connectionError
      onRefresh={refresh}
      onSetup={vi.fn()}
    />,
  );
  expect(
    screen
      .getAllByRole("alert")
      .some((node) => node.textContent?.includes("Connection to X-DDE lost")),
  ).toBe(true);
  expect(
    screen.queryByText("Platform service ready", { exact: true }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(refresh).toHaveBeenCalledOnce();
});

it("can inspect existing server snapshots without inventing engine availability", () => {
  render(
    <RuntimeStatus
      language="zh"
      health={{ ...health, engines: undefined, platform: undefined }}
      connectionError={false}
      onRefresh={vi.fn()}
      onSetup={vi.fn()}
    />,
  );
  expect(screen.getByText("平台服务就绪", { exact: true })).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "OpenDDE · 集成环境" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "DiffSBDD · 集成环境" }),
  ).toBeNull();
});
