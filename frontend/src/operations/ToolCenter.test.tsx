import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import type { Language } from "../types";
import { tools } from "./catalog";
import { ToolCenter } from "./ToolCenter";

afterEach(() => vi.restoreAllMocks());

function props(language: Language = "en") {
  return {
    language,
    health: null,
    jobs: [],
    onCreated: vi.fn(),
    onDraft: vi.fn(),
    onPredict: vi.fn(),
  };
}

it.each(["zh", "en"] as const)(
  "keeps every capability directly accessible in %s without starting a task",
  async (language) => {
    const user = userEvent.setup();
    const handlers = props(language);
    const submit = vi.spyOn(api, "submit");
    const index = language === "zh" ? 0 : 1;
    render(<ToolCenter {...handlers} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      language === "zh" ? "全部能力" : "All capabilities",
    );
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(
      tools.length,
    );
    for (const tool of tools)
      expect(
        screen.getByRole("button", { name: tool.label[index] }),
      ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: tools[0].label[index] }),
    );
    expect(handlers.onPredict).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  },
);

it("reports filtered counts and recovers from an empty search with one action", async () => {
  const user = userEvent.setup();
  render(<ToolCenter {...props()} />);
  const search = screen.getByRole("searchbox", { name: "Search capabilities" });

  await user.type(search, "  rDKit  ");
  expect(screen.getByRole("status")).toHaveTextContent(
    `Showing 1 of ${tools.length} capabilities`,
  );
  expect(
    screen.getByRole("heading", { name: "Calculate molecular properties" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Design" }));
  expect(screen.getByRole("status")).toHaveTextContent(
    `Showing 0 of ${tools.length} capabilities`,
  );
  expect(
    screen.getByRole("heading", { name: "No matching capabilities" }),
  ).toBeVisible();

  await user.click(
    screen.getByRole("button", { name: "Show all capabilities" }),
  );
  expect(search).toHaveValue("");
  expect(search).toHaveFocus();
  expect(
    screen.getByRole("button", { name: "All capabilities" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("status")).toHaveTextContent(
    `Showing ${tools.length} of ${tools.length} capabilities`,
  );
  expect(
    screen.queryByRole("heading", { name: "No matching capabilities" }),
  ).toBeNull();
});

it("supports bilingual search and clearing filters in Chinese", async () => {
  const user = userEvent.setup();
  render(<ToolCenter {...props("zh")} />);
  await user.type(screen.getByRole("searchbox"), "molecular properties");
  expect(screen.getByRole("status")).toHaveTextContent(
    `显示 1 / ${tools.length} 项能力`,
  );
  expect(
    screen.getByRole("heading", { name: "计算小分子性质", level: 2 }),
  ).toBeVisible();

  await user.click(screen.getByRole("button", { name: "清空搜索与筛选" }));
  expect(screen.getByRole("status")).toHaveTextContent(
    `显示 ${tools.length} / ${tools.length} 项能力`,
  );
  expect(screen.getByRole("searchbox")).toHaveValue("");
});

it("preserves active form input on language changes and restores filtered navigation", async () => {
  vi.spyOn(api, "assets").mockResolvedValue([]);
  const submit = vi.spyOn(api, "submit");
  const user = userEvent.setup();
  const handlers = props();
  const { rerender } = render(<ToolCenter {...handlers} />);
  await user.type(screen.getByRole("searchbox"), "RDKit");
  await user.click(
    screen.getByRole("button", { name: "Properties & scoring" }),
  );
  await user.click(
    screen.getByRole("button", {
      name: "Calculate molecular properties",
    }),
  );

  const heading = screen.getByRole("heading", { level: 1 });
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(heading).toHaveTextContent("Calculate molecular properties");
  expect(heading).toHaveFocus();
  expect(screen.queryByRole("searchbox")).toBeNull();
  await user.type(screen.getByRole("textbox", { name: "SMILES" }), "CCO");
  await user.type(
    screen.getByRole("textbox", { name: "Task name (optional)" }),
    "Draft molecule",
  );

  rerender(<ToolCenter {...handlers} language="zh" />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "计算小分子性质",
  );
  expect(screen.getByRole("textbox", { name: "SMILES" })).toHaveValue("CCO");
  expect(screen.getByRole("textbox", { name: "任务名称（可选）" })).toHaveValue(
    "Draft molecule",
  );
  expect(submit).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "返回全部能力" }));
  expect(screen.getByRole("searchbox")).toHaveValue("RDKit");
  expect(screen.getByRole("button", { name: "性质与评分" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    `显示 1 / ${tools.length} 项能力`,
  );
  expect(screen.getByRole("button", { name: "计算小分子性质" })).toHaveFocus();
});
