import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeploymentActivity } from "./DeploymentActivity";
import type { Deployment } from "./client";
import { deploymentFixture } from "./fixtures";

describe("complete installation activity", () => {
  it("names every registered component and preserves operations beyond the first twenty", () => {
    const data = {
      packages: [{ id: "p2rank", name: "P2Rank", version: "2.5.1" }],
      operations: Array.from({ length: 23 }, (_, index) => ({
        id: String(index),
        package: index === 22 ? "p2rank" : `new-component-${index}`,
        action: "install",
        state: "queued",
        stage: "Waiting",
        error: null,
      })),
    } as Deployment;
    render(
      <DeploymentActivity data={data} zh busy={false} execute={vi.fn()} />,
    );
    expect(screen.getByText("口袋寻找 · P2Rank")).toBeVisible();
    expect(screen.getByText("new-component-0")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "暂停" })).toHaveLength(23);
  });
});

it("folds completed history without discarding any operations", () => {
  const data = deploymentFixture([], {
    operations: Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      package: `done-${i}`,
      state: "succeeded",
      stage: "Done",
      action: "install",
      error: null,
    })),
  });
  render(<DeploymentActivity data={data} zh busy={false} execute={vi.fn()} />);
  expect(screen.getByText("done-29")).not.toBeVisible();
  expect(screen.queryByRole("heading", { name: /安装进度/ })).toBeNull();
  fireEvent.click(screen.getByText("安装历史"));
  expect(screen.getByText("done-29")).toBeVisible();
  expect(screen.getAllByRole("button", { name: "日志" })).toHaveLength(30);
});

it("keeps paused and unresolved latest failures visible while folding superseded failures", () => {
  const operation = (
    id: string,
    component: string,
    state: string,
    error: string | null = null,
  ) => ({
    id,
    package: component,
    state,
    stage: state,
    action: "install",
    error,
  });
  const data = deploymentFixture([], {
    operations: [
      operation("a", "working", "paused"),
      operation("b", "broken", "failed", "Unresolved failure"),
      operation("c", "recovered", "succeeded"),
      operation("d", "recovered", "failed", "Superseded failure"),
    ],
  });
  render(<DeploymentActivity data={data} zh busy={false} execute={vi.fn()} />);
  expect(screen.getByText("Unresolved failure")).toBeVisible();
  expect(screen.getByText("Superseded failure")).not.toBeVisible();
  expect(screen.getAllByRole("button", { name: "继续 / 重试" })).toHaveLength(
    2,
  );
  fireEvent.click(screen.getByText("安装历史"));
  expect(screen.getByText("Superseded failure")).toBeVisible();
});
