import { render, screen } from "@testing-library/react";
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

it("removes completed installation history and log controls from the user interface", () => {
  const data = deploymentFixture([], {
    operations: [
      {
        id: "completed",
        package: "ketcher",
        state: "succeeded",
        stage: "Done",
        action: "install",
        error: null,
      },
    ],
  });
  const { container } = render(
    <DeploymentActivity data={data} zh busy={false} execute={vi.fn()} />,
  );
  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByText("安装历史")).toBeNull();
  expect(screen.queryByRole("button", { name: "日志" })).toBeNull();
});

it("keeps paused and unresolved latest failures visible without displaying superseded failures", () => {
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
  expect(screen.queryByText("Superseded failure")).toBeNull();
  const retries = screen.getAllByRole("button", { name: "继续 / 重试" });
  expect(retries).toHaveLength(2);
  expect(retries[0]).toBeVisible();
  expect(retries[1]).toBeVisible();
});
