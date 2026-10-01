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
  "keeps real capability entries directly accessible in %s",
  async (language) => {
    const user = userEvent.setup(),
      handlers = props(language),
      submit = vi.spyOn(api, "submit");
    render(<ToolCenter {...handlers} />);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(
      tools.length,
    );
    for (const tool of tools)
      expect(
        screen.getByRole("button", {
          name: tool.label[language === "zh" ? 0 : 1],
        }),
      ).toBeVisible();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(
      screen.queryByText(/Choose a drug modality|先选药物形式/),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: tools[0].label[language === "zh" ? 0 : 1],
      }),
    );
    expect(handlers.onPredict).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  },
);
it("retains form input and overlapping modality navigation across languages", async () => {
  vi.spyOn(api, "assets").mockResolvedValue([]);
  const submit = vi.spyOn(api, "submit"),
    user = userEvent.setup(),
    handlers = props();
  const { rerender } = render(<ToolCenter {...handlers} />);
  await user.click(screen.getByRole("button", { name: "Small molecules" }));
  await user.click(
    screen.getByRole("button", { name: "Calculate molecular properties" }),
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  await user.click(
    screen.getByRole("radio", {
      name: "Paste molecular structure text (SMILES)",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.type(screen.getByRole("textbox", { name: "SMILES" }), "CCO");
  rerender(<ToolCenter {...handlers} language="zh" />);
  expect(screen.getByRole("textbox", { name: "SMILES" })).toHaveValue("CCO");
  await user.click(screen.getByRole("button", { name: "返回全部能力" }));
  expect(screen.getByRole("button", { name: "小分子" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "计算小分子性质" })).toHaveFocus();
  expect(submit).not.toHaveBeenCalled();
});
it("shows the same antibody task in each applicable category without extra introductory blocks", async () => {
  const user = userEvent.setup(),
    submit = vi.spyOn(api, "submit");
  render(<ToolCenter {...props()} />);
  for (const name of ["Biologics", "Antibodies", "Proteins"]) {
    await user.click(screen.getByRole("button", { name }));
    expect(
      screen.getByRole("button", {
        name: "Antibody design and CDR optimization",
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Calculate molecular properties" }),
    ).toBeNull();
  }
  await user.click(screen.getByRole("button", { name: "RNA" }));
  expect(screen.getByRole("button", { name: "RNA" })).toHaveAttribute(
    "title",
    expect.stringContaining("not general RNA drug design"),
  );
  expect(
    screen.getByRole("button", { name: "Prepare MSAs and templates" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", {
      name: "Antibody design and CDR optimization",
    }),
  ).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});
it("returns a direct task entry to the catalogue through the shared navigation", async () => {
  vi.spyOn(api, "assets").mockResolvedValue([]);
  const onBrowse = vi.fn(),
    user = userEvent.setup();
  render(
    <ToolCenter {...props()} initialTool="properties" onBrowse={onBrowse} />,
  );
  expect(
    screen.getByRole("radiogroup", { name: "How will you provide molecules?" }),
  ).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Back to all capabilities" }),
  );
  expect(onBrowse).toHaveBeenCalledOnce();
});
