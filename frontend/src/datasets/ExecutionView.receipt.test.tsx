import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import { ExecutionView } from "./ExecutionView";
vi.mock("./DatasetResults", () => ({ DatasetResults: () => null }));
vi.mock("../workflows/RunMonitor", () => ({ RunMonitor: () => null }));
afterEach(() => vi.unstubAllGlobals());
it.each(["en", "zh"] as const)(
  "provides the exact accepted job link in %s even if progress loading fails",
  async (language) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Progress unavailable" }), {
          status: 503,
        }),
      ),
    );
    const job = {
      id: "33333333-3333-4333-8333-333333333333",
      request: { name: "Accepted fixture" },
      status: "queued",
    } as Job;
    render(
      <ExecutionView
        execution={{ id: job.id, kind: "job", job }}
        language={language}
        onCreated={vi.fn()}
      />,
    );
    const link = screen.getByRole("link", {
      name:
        language === "en"
          ? "Open task progress and results"
          : "查看任务进度与结果",
    });
    expect(link).toHaveAttribute("href", "/#task=" + job.id);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Progress unavailable",
    );
    expect(link).toBeVisible();
  },
);
