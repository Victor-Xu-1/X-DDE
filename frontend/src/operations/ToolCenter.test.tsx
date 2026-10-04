import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { useState, type ComponentProps } from "react";
import type { Language } from "../types";
import { tools, type ToolId } from "./catalog";
import { ToolCenter as ControlledToolCenter } from "./ToolCenter";
function ToolCenter(
  p: Omit<
    ComponentProps<typeof ControlledToolCenter>,
    "selectedTool" | "onSelectTool"
  > & { initialTool?: ToolId; onBrowse?(): void; onPredict(): void },
) {
  const [selected, setSelected] = useState<ToolId | null>(
    p.initialTool ?? null,
  );
  return (
    <ControlledToolCenter
      {...p}
      selectedTool={selected}
      onSelectTool={(tool) => {
        if (tool === "predict") p.onPredict();
        else {
          setSelected(tool);
          if (tool === null) p.onBrowse?.();
        }
      }}
    />
  );
}
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
    expect(document.querySelectorAll(".tool-card h2")).toHaveLength(
      tools.filter((t) => t.group !== "system").length,
    );
    for (const summary of Array.from(
      document.querySelectorAll(".capability-additional > summary"),
    ))
      await user.click(summary);
    for (const tool of tools.filter((t) => t.group !== "system"))
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
        name: tools.find((tool) => tool.id === "predict")!.label[
          language === "zh" ? 0 : 1
        ],
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
  for (const summary of Array.from(
    document.querySelectorAll(".capability-additional > summary"),
  ))
    await user.click(summary);
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
