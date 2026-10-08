import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import { Header } from "./Header";
afterEach(cleanup);
const jobs = [
  {
    id: "public-1",
    request: { name: "BRD4 binding study" },
    created_at: "2026-10-02T10:00:00Z",
    status: "failed",
  },
  {
    id: "public-2",
    request: { name: "HER2 antibody study" },
    created_at: "2026-10-03T10:00:00Z",
    status: "interrupted",
  },
] as Job[];

it("opens compact search, reports empty results and returns focus when dismissed", async () => {
  const user = userEvent.setup();
  render(
    <Header
      view="home"
      language="en"
      jobs={jobs}
      onJob={vi.fn()}
      storageWarning={false}
    />,
  );
  const trigger = screen.getByRole("button", { name: "Search tasks" });
  await user.click(trigger);
  const input = screen.getByRole("searchbox", { name: "Search tasks" });
  expect(input).toHaveFocus();
  await user.type(input, "not-a-real-study");
  expect(screen.getByRole("status")).toHaveTextContent("No matching task");
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(
    screen.queryByRole("region", { name: "Task search results" }),
  ).toBeNull();
});

it("searches original job names and IDs and selects a real result by keyboard", async () => {
  const user = userEvent.setup(),
    onJob = vi.fn();
  render(
    <Header
      view="home"
      language="en"
      jobs={jobs}
      onJob={onJob}
      storageWarning={false}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Search tasks" }));
  await user.type(
    screen.getByRole("searchbox", { name: "Search tasks" }),
    "public-",
  );
  const choices = within(
    screen.getByRole("region", { name: "Task search results" }),
  ).getAllByRole("button");
  await user.keyboard("{ArrowDown}");
  expect(choices[0]).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(choices[1]).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(onJob).toHaveBeenCalledWith("public-2");
  expect(
    screen.queryByRole("region", { name: "Task search results" }),
  ).toBeNull();
});

it("uses readable Chinese task statuses and closes notifications with Escape", async () => {
  const user = userEvent.setup(),
    onJob = vi.fn();
  render(
    <Header
      view="tasks"
      language="zh"
      jobs={jobs}
      onJob={onJob}
      storageWarning
    />,
  );
  expect(screen.getByText("任务与结果")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(
    "浏览器无法记住语言选择",
  );
  const trigger = screen.getByLabelText("任务提醒", { selector: "summary" });
  await user.click(trigger);
  expect(
    screen.getByRole("button", { name: "BRD4 binding study · 失败" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "HER2 antibody study · 已中断" }),
  ).toBeVisible();
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  expect(trigger.closest("details")).not.toHaveAttribute("open");
  expect(
    screen.getByRole("button", { name: "BRD4 binding study · 失败" }),
  ).not.toBeVisible();
});
