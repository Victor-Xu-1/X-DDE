import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { FepLigandSelection } from "./FepLigandSelection";
import type { Language } from "../types";

vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ source }: { source: { record: number } }) => (
    <img alt={`Original record ${source.record}`} />
  ),
}));
afterEach(cleanup);
const source = {
  asset_id: "series",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const records = Array.from({ length: 25 }, (_, record) => ({
  record,
  name: `STAT6 member ${record + 1}`,
}));
function Selection({ language }: { language: Language }) {
  const [selected, onChange] = useState<number[]>([]);
  return (
    <FepLigandSelection
      source={source}
      records={records}
      selected={selected}
      onChange={onChange}
      language={language}
      onRetry={vi.fn()}
    />
  );
}
it.each(["en", "zh"] as const)(
  "%s paginates, searches and deselects off-page original records without changing indices",
  async (language) => {
    const user = userEvent.setup();
    render(<Selection language={language} />);
    expect(screen.getAllByRole("img")).toHaveLength(12);
    expect(
      screen.getByText(language === "en" ? "Record 1" : "原始序号 1"),
    ).toBeVisible();
    await user.click(
      screen.getByRole("checkbox", { name: "STAT6 member 1 · 1" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: language === "en" ? "Next page" : "下一页",
      }),
    );
    expect(
      screen.getByRole("img", { name: "Original record 12" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("checkbox", { name: "STAT6 member 13 · 13" }),
    );
    const search = screen.getByRole("searchbox");
    await user.type(search, "member 25");
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(
      screen.getByRole("img", { name: "Original record 24" }),
    ).toBeVisible();
    expect(
      within(
        screen.getByLabelText(
          language === "en" ? "Chosen molecules" : "所选分子",
        ),
      ).getAllByRole("button"),
    ).toHaveLength(2);
    await user.click(
      screen.getByRole("button", {
        name:
          language === "en"
            ? "Remove STAT6 member 1 · 1"
            : "移除 STAT6 member 1 · 1",
      }),
    );
    await user.clear(search);
    expect(
      screen.getByRole("checkbox", { name: "STAT6 member 1 · 1" }),
    ).not.toBeChecked();
    await user.click(
      screen.getByRole("button", {
        name: language === "en" ? "Next page" : "下一页",
      }),
    );
    expect(
      screen.getByRole("checkbox", { name: "STAT6 member 13 · 13" }),
    ).toBeChecked();
  },
);
it("shows bounded loading and an explicit retry instead of exposing an empty selection page", async () => {
  const retry = vi.fn();
  const props = {
    source,
    selected: [0, 1],
    onChange: vi.fn(),
    language: "en" as const,
    onRetry: retry,
  };
  const view = render(<FepLigandSelection {...props} />);
  expect(screen.getByRole("status")).toHaveTextContent("Reading");
  view.rerender(
    <FepLigandSelection {...props} error={new Error("private path")} />,
  );
  expect(screen.getByRole("alert")).not.toHaveTextContent("private path");
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
