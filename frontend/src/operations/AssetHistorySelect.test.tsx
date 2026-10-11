import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AssetHistorySelect } from "./AssetHistorySelect";
import { catalogFixture } from "../diffsbdd/input-catalog.test-fixtures";
import type { Asset } from "./types";
it("retains the exact selected file outside the visible page and keeps paging separate from selection", () => {
  const selected: Asset = {
    id: "original",
    name: "STAT6.fasta",
    kind: "sequences",
    suffix: ".fasta",
    size: 847,
    sha256: "a".repeat(64),
    created_at: "2026-10-11",
  };
  const next = { ...selected, id: "next", name: "Another.fasta" };
  const data = { ...catalogFixture([], [next]), total: 51 };
  const choose = vi.fn(),
    page = vi.fn(),
    query = vi.fn();
  render(
    <AssetHistorySelect
      language="en"
      label="Sequence input"
      value={selected.id}
      selected={selected}
      data={data}
      loading={false}
      query=""
      page={0}
      onQuery={query}
      onPage={page}
      onSelect={choose}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Sequence input" })).toHaveValue(
    selected.id,
  );
  expect(
    screen.getByRole("option", { name: "Current selection: STAT6.fasta" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(page).toHaveBeenCalledWith(1);
  expect(choose).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox", { name: "Sequence input" }), {
    target: { value: next.id },
  });
  expect(choose).toHaveBeenCalledWith(next);
});
