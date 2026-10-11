import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FepMoleculeReview } from "./FepMoleculeReview";

vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ source }: { source: { url: string; record: number } }) => (
    <img alt={`Original record ${source.record}`} data-source={source.url} />
  ),
}));
afterEach(cleanup);
const source = {
  asset_id: "series/source",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const records = [
  { record: 0, name: "STAT6 lead" },
  { record: 1, name: "Other molecule" },
  { record: 2, name: "STAT6 lead" },
];
it.each(["en", "zh"] as const)(
  "%s confirms exact selected records and submitted order, even with repeated titles",
  (language) => {
    render(
      <FepMoleculeReview
        source={source}
        records={records}
        selected={[2, 0]}
        language={language}
      />,
    );
    const review = screen.getByRole("region", {
      name: language === "en" ? "Molecules to submit" : "递交的分子",
    });
    const rows = within(review).getAllByRole("listitem");
    expect(rows.map((row) => row.getAttribute("data-original-record"))).toEqual(
      ["2", "0"],
    );
    expect(
      within(rows[0]).getByText(language === "en" ? "Record 3" : "原始序号 3"),
    ).toBeVisible();
    expect(
      within(rows[1]).getByText(language === "en" ? "Record 1" : "原始序号 1"),
    ).toBeVisible();
    expect(within(review).getAllByText("STAT6 lead")).toHaveLength(2);
    expect(
      within(review).queryByText("Other molecule"),
    ).not.toBeInTheDocument();
    expect(
      within(review).getByRole("img", { name: "Original record 2" }),
    ).toHaveAttribute("data-source", "/api/assets/series%2Fsource");
  },
);
it.each([[0, 4], [0, 0], [0]])(
  "requires a complete valid selection rather than silently omitting records: %j",
  (...selected) => {
    render(
      <FepMoleculeReview
        source={source}
        records={records}
        selected={selected}
        language="en"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Return to molecular selection",
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  },
);
it("unloaded files cannot produce a confirmation image", () => {
  render(<FepMoleculeReview source={source} selected={[0, 2]} language="en" />);
  expect(screen.getByRole("status")).toBeVisible();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
