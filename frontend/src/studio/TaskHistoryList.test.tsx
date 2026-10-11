import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import type { TaskHistoryPage } from "./task-history-model";
import { TaskHistoryList } from "./TaskHistoryList";

afterEach(cleanup);

it.each(["en", "zh"] as const)(
  "uses verified case titles and unchanged personal titles in %s",
  (language) => {
    const original = "Public native transport-engine";
    const data: TaskHistoryPage = {
      items: [
        {
          job: {
            id: "fixed",
            request: { name: original },
            status: "succeeded",
            created_at: "2026-10-11T00:00:00Z",
          } as Job,
          capability_id: "properties",
          origin: "fixed_example",
          example_cases: [
            { id: "stat6", label: ["STAT6 研究", "STAT6 study"] },
          ],
        },
        {
          job: {
            id: "own",
            request: { name: "Researcher notes" },
            status: "cancelled",
            created_at: "2026-10-11T00:00:00Z",
          } as Job,
          capability_id: "properties",
          origin: "research",
        },
        {
          job: {
            id: "unlinked",
            request: { name: "Unknown engine run" },
            status: "succeeded",
            created_at: "2026-10-11T00:00:00Z",
          } as Job,
          capability_id: "properties",
          origin: "fixed_example",
          example_cases: [],
        },
      ],
      total: 3,
      offset: 0,
      limit: 20,
      counts: {},
    };
    const select = vi.fn();
    render(
      <TaskHistoryList
        data={data}
        language={language}
        page={0}
        selected={undefined}
        loading={false}
        onJob={select}
        onPage={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: language === "zh" ? "STAT6 研究" : "STAT6 study",
      }),
    );
    expect(select).toHaveBeenCalledWith("fixed");
    expect(
      screen.getByRole("button", { name: "Researcher notes" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name:
          language === "zh" ? "历史参考结果" : "Historical reference result",
      }),
    ).toBeVisible();
    expect(screen.queryByText(original)).toBeNull();
    expect(screen.queryByText("Unknown engine run")).toBeNull();
    expect(data.items[0].job.request.name).toBe(original);
  },
);
