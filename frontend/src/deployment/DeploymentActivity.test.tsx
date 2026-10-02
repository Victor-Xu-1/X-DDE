import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeploymentActivity } from "./DeploymentActivity";
import type { Deployment } from "./client";

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
    expect(screen.getByText("P2Rank")).toBeVisible();
    expect(screen.getByText("new-component-0")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "暂停" })).toHaveLength(23);
  });
});
