import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { CampaignCasePreview } from "./CampaignCasePreview";
import { ExampleContext } from "./context";
import type { PreparedExample } from "./types";
import { campaignMaterials, mutableRegions } from "./campaign-preview-model";
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls }: { urls: string[] }) => (
    <div role="region" aria-label="Reference model">
      {urls.join("|")}
    </div>
  ),
}));
afterEach(cleanup);
const a = "a97d8c4f-4562-4387-abc5-16f569581271",
  b = "b97d8c4f-4562-4387-abc5-16f569581271";
const example = {
  record: { kind: "campaign" },
  campaign_draft: {
    targetName: "HER2",
    targets: { C: "QCSQFLRG" },
    format: "VHVL",
    binders: { B: "EVQLVESGG", A: "DIQMTQSP" },
    cdr: { B: [1, 2, 6], A: [2, 3] },
    fixed: {},
    budget: "small",
  },
  objects: {
    her2_domain_iv: {
      kind: "structure",
      label: "Native target reference",
      reference: { asset_id: a, record: 0, conformer: 0 },
    },
    her2: {
      kind: "structure",
      label: "Native antibody reference",
      reference: { asset_id: b, record: 0, conformer: 0 },
    },
  },
} as unknown as PreparedExample;
it("shows the existing reference and exact mutable sequences without pretending design has run", async () => {
  const before = JSON.stringify(example);
  render(
    <ExampleContext.Provider value={example}>
      <CampaignCasePreview language="en" />
    </ExampleContext.Provider>,
  );
  expect(screen.getByText("Input template · Design has not run")).toBeVisible();
  expect(
    screen.getByRole("region", { name: "Reference model" }),
  ).toHaveTextContent(a);
  const user = userEvent.setup();
  await user.click(
    within(screen.getByRole("table", { name: "Research materials" })).getByRole(
      "button",
      { name: "Antibody variable domain · Input chain B" },
    ),
  );
  expect(
    screen.getByRole("region", { name: "Reference model" }),
  ).toHaveTextContent(b);
  await user.click(screen.getByRole("tab", { name: "Sequence and CDR" }));
  expect(
    screen.getByRole("region", {
      name: "Antibody variable domain · Input chain B",
    }),
  ).toBeVisible();
  const marks = screen.getAllByRole("button", { name: /^CDR$/ });
  expect(marks[0]).toHaveAttribute("title", "CDR · 2–3");
  expect(marks[1]).toHaveAttribute("title", "CDR · 7–7");
  expect(
    screen.getByRole("button", { name: "Download this sequence FASTA" }),
  ).toBeVisible();
  expect(JSON.stringify(example)).toBe(before);
});
it("retains zero-based input identity and refuses out-of-range CDR marks without silently filtering them", () => {
  const positions = [2, 0, 1, 2, 5];
  expect(mutableRegions("ABCDEF", positions)).toEqual([
    { start: 1, end: 3, label: "CDR" },
    { start: 6, end: 6, label: "CDR" },
  ]);
  expect(positions).toEqual([2, 0, 1, 2, 5]);
  expect(mutableRegions("ABC", [-1])).toBeNull();
  expect(mutableRegions("ABC", [3])).toBeNull();
  expect(
    campaignMaterials(example.campaign_draft!).map((row) => row.sequence),
  ).toEqual(["QCSQFLRG", "EVQLVESGG", "DIQMTQSP"]);
});
it("keeps a valid sequence view usable when a verified reference structure is absent", () => {
  render(
    <ExampleContext.Provider value={{ ...example, objects: {} }}>
      <CampaignCasePreview language="en" />
    </ExampleContext.Provider>,
  );
  expect(screen.getByRole("tab", { name: "Sequence and CDR" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    screen.queryByRole("region", { name: "Reference model" }),
  ).not.toBeInTheDocument();
});
