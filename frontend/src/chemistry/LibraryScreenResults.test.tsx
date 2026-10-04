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

it("shows native matched rules and scaffold families without implying safety or activity rank", async () => {
  const row = {
    record: 0,
    selected: true,
    available: true,
    structural_alerts: [{ catalogue: "BRENK", rule: "review_pattern" }],
    scaffold_group: 0,
    similarity: null,
    substructure_match: null,
    descriptors: {
      smiles: "COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1",
      mw: 446.9,
      logp: 4.2,
      fragments: 1,
    },
  };
  const result = {
    options: { mode: "scaffold", alert_policy: "warn" },
    rows: [row],
    selected_records: [0],
    artifact: "selected.sdf",
    report_artifact: "library-report.csv",
    scaffold_groups: [
      { index: 0, kind: "murcko", smiles: "c1ccccc1", records: [0, 1] },
    ],
  } as unknown as LibraryScreenResult;
  render(
    <LibraryScreenResults
      job={{ id: "job" } as Job}
      result={result}
      language="zh"
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("1 个分子需核查");
  expect(screen.getByText(/不是药效排名/)).toBeVisible();
  await userEvent.click(screen.getByText("需核查：1 条"));
  expect(screen.getByText("Brenk · review_pattern")).toBeVisible();
  expect(screen.getByText("骨架 1")).toBeVisible();
  expect(screen.getByRole("link", { name: "下载筛选表格" })).toHaveAttribute(
    "href",
    expect.stringContaining("library-report.csv"),
  );
});

it("does not turn a historical unevaluated report into a no-alert claim", () => {
  render(
    <LibraryScreenResults
      job={{ id: "legacy" } as Job}
      result={
        {
          options: { alert_policy: "off" },
          rows: [],
          selected_records: [],
          artifact: "selected.sdf",
        } as unknown as LibraryScreenResult
      }
      language="en"
    />,
  );
  expect(screen.queryByText("No rule matches")).toBeNull();
  expect(
    screen.queryByRole("link", { name: "Download selection report" }),
  ).toBeNull();
});
