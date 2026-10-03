import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { Job } from "../types";
import { EpitopeResults } from "./EpitopeResults";
afterEach(cleanup);
it("distinguishes protein contact residues from structure water without changing native totals", () => {
  const value = {
    epitope_size: 3,
    total_contacts: 44,
    epitope_residues: [
      { chain: "C", residue_id: 572, residue_name: "PRO", contacts: 32 },
      { chain: "C", residue_id: 573, residue_name: "PHE", contacts: 11 },
      { chain: "C", residue_id: 1045, residue_name: "HOH", contacts: 1 },
    ],
  };
  const original = JSON.stringify(value);
  render(
    <EpitopeResults
      language="zh"
      job={{ request: { operation: "harness", payload: {} } } as unknown as Job}
      value={value}
    />,
  );
  expect(screen.getByText("蛋白接触残基: 2")).toBeVisible();
  expect(screen.getByText(/1 个结构水/)).toBeVisible();
  expect(
    within(screen.getByRole("table", { name: "蛋白接触残基" })).getByText(
      "C:PRO572",
    ),
  ).toBeVisible();
  expect(JSON.stringify(value)).toBe(original);
});
