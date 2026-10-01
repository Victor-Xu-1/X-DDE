import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import type { LibraryScreenResult } from "./screen-types";
import { LibraryScreenResults } from "./LibraryScreenResults";
vi.mock("./StateForm", () => ({
  StateForm: ({
    initialMolecule,
  }: {
    initialMolecule: { version_id: string; record: number };
  }) => (
    <p>
      Exact handoff: {initialMolecule.version_id} / {initialMolecule.record}
    </p>
  ),
}));
afterEach(cleanup);
it("shows reasons in Chinese and hands off the saved output record rather than its original index", async () => {
  const ref = {
    asset_id: "output",
    sha256: "a".repeat(64),
    record: 0,
    conformer: 0,
    version_id: "selected-version",
  };
  const result = {
    selected_records: [3],
    artifact: "selected.sdf",
    rows: [
      {
        record: 3,
        available: true,
        eligible: true,
        selected: true,
        output_record: 0,
        reason: null,
        reason_code: null,
        duplicate_of: null,
        similarity: null,
        substructure_match: null,
        reference: ref,
        descriptors: { smiles: "CCO", mw: 46.069, logp: -0.001, fragments: 1 },
      },
      {
        record: 4,
        available: true,
        eligible: false,
        selected: false,
        output_record: null,
        reason: "Chemical duplicate of record 4.",
        reason_code: "duplicate",
        duplicate_of: 3,
        similarity: null,
        substructure_match: null,
        descriptors: { smiles: "CCO", mw: 46.069, logp: -0.001, fragments: 1 },
      },
    ],
  } as unknown as LibraryScreenResult;
  const user = userEvent.setup();
  render(
    <LibraryScreenResults
      job={{ id: "job" } as Job}
      result={result}
      language="zh"
      onCreated={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("checkbox", { name: "只看选中分子" }));
  expect(screen.getByText("重复结构，保留原始第 4 条")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "准备分子" }));
  expect(screen.getByText("Exact handoff: selected-version / 0")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "返回分子库结果" }));
  expect(screen.getByText("重复结构，保留原始第 4 条")).toBeVisible();
});
it("presents zero hits without a molecule download or invented reusable reference", () => {
  render(
    <LibraryScreenResults
      job={{ id: "job" } as Job}
      result={
        {
          rows: [],
          selected_records: [],
          artifact: "selected.sdf",
        } as unknown as LibraryScreenResult
      }
      language="en"
      onCreated={vi.fn()}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("No molecules selected");
  expect(screen.queryByRole("button", { name: "Prepare molecule" })).toBeNull();
  expect(
    screen.queryByRole("link", { name: "Download selected SDF" }),
  ).toBeNull();
});
