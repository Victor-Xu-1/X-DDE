import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ResultTree } from "./StructuredResults";
afterEach(cleanup);
it("keeps native residue metrics in one optional table without inventing force or energy", async () => {
  const residues = Array.from({ length: 22 }, (_, i) => ({
    chain: "C",
    residue: 600 + i,
    contacts: i + 2,
    distance: 3.25,
  }));
  render(
    <ResultTree
      zh
      value={{
        epitope_size: 22,
        total_contacts: 237,
        epitope_residues: residues,
        stderr: "internal",
        sha256: "audit",
      }}
    />,
  );
  expect(screen.getByText("237")).toBeVisible();
  expect(screen.queryByText("internal")).not.toBeInTheDocument();
  const group = screen.getByText("表位残基", { selector: "summary" });
  expect(group.closest("details")).not.toHaveAttribute("open");
  await userEvent.setup().click(group);
  const rows = within(screen.getByRole("table")).getAllByRole("row");
  expect(rows).toHaveLength(23);
  expect(rows[22]).toHaveTextContent("621");
  expect(screen.getByRole("columnheader", { name: "距离（Å）" })).toBeVisible();
  expect(screen.queryByText(/kcal|kJ|作用力/)).not.toBeInTheDocument();
});
it("retains complete long sequences, values and nested records in both languages", () => {
  const seq = "EVQL".repeat(50);
  render(
    <ResultTree
      zh={false}
      value={{
        scores: [-2.5, -1.25],
        candidates: [
          { sequence: seq, iptm: 0.82 },
          { sequence: seq + "A", iptm: 0.77 },
        ],
        summary: { available: true },
      }}
    />,
  );
  expect(screen.getByText("-2.5")).toBeVisible();
  expect(screen.getAllByText(seq)).toHaveLength(1);
  expect(screen.getByText("0.82")).toBeInTheDocument();
  expect(screen.getByText("Yes")).toBeVisible();
});
