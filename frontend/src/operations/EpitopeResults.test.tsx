import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { contactRecords, proteinContacts } from "./epitope-contacts";
import type { Job } from "../types";
import { EpitopeResults } from "./EpitopeResults";
afterEach(cleanup);
const viewer = vi.fn(
  ({
    focusResidue,
    initialMode,
  }: {
    focusResidue?: { residue: string; nonce: number };
    initialMode?: string;
  }) => (
    <div
      role="region"
      aria-label="Test structure viewer"
      data-focus={focusResidue?.residue}
      data-mode={initialMode}
    />
  ),
);
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: (props: Parameters<typeof viewer>[0]) => viewer(props),
}));
const asset = "a97d8c4f-4562-4387-abc5-16f569581271";
function sourceJob(id = "first") {
  return {
    id,
    request: {
      operation: "harness",
      payload: { structure_path: "asset:" + asset },
      scientific_inputs: [{ asset_id: asset, record: 0, conformer: 0 }],
    },
  } as unknown as Job;
}
const contacts = Array.from({ length: 7 }, (_, index) => ({
  chain: "C",
  residue_id: 570 + index,
  residue_name: "PRO",
  contacts: 32 - index,
}));
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
  fireEvent.focus(screen.getByRole("button", { name: "接触数量说明" }));
  expect(screen.getByRole("tooltip")).toHaveTextContent("1 个结构水");
  expect(
    within(screen.getByRole("table", { name: "蛋白接触残基" })).getByText(
      "C:PRO572",
    ),
  ).toBeVisible();
  expect(JSON.stringify(value)).toBe(original);
});

it("shows the real top five, expands all, and locates repeated selections without changing records", async () => {
  const original = JSON.stringify(contacts);
  const { rerender } = render(
    <EpitopeResults
      job={sourceJob()}
      value={{ epitope_residues: contacts }}
      language="zh"
    />,
  );
  const table = screen.getByRole("table", { name: "蛋白接触残基" });
  expect(within(table).getAllByRole("button")).toHaveLength(5);
  expect(
    screen.getByRole("region", { name: "Test structure viewer" }),
  ).toHaveAttribute("data-mode", "cartoon");
  const user = userEvent.setup();
  const button = within(table).getByRole("button", { name: "C:PRO570" });
  await user.click(button);
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("region", { name: "Test structure viewer" }),
  ).toHaveAttribute("data-focus", "C:PRO570");
  const firstNonce = viewer.mock.lastCall?.[0].focusResidue?.nonce;
  await user.click(button);
  expect(viewer.mock.lastCall?.[0].focusResidue?.nonce).toBe(
    (firstNonce ?? 0) + 1,
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "显示残基" }),
    "all",
  );
  expect(within(table).getAllByRole("button")).toHaveLength(7);
  rerender(
    <EpitopeResults
      job={sourceJob("second")}
      value={{ epitope_residues: contacts }}
      language="zh"
    />,
  );
  expect(
    screen.getByRole("region", { name: "Test structure viewer" }),
  ).not.toHaveAttribute("data-focus");
  expect(JSON.stringify(contacts)).toBe(original);
});

it("offers text instead of unusable structure actions when the declared source is absent", () => {
  render(
    <EpitopeResults
      job={
        {
          id: "absent",
          request: { operation: "harness", payload: {} },
        } as unknown as Job
      }
      value={{ epitope_residues: contacts }}
      language="en"
    />,
  );
  expect(screen.getByText("C:PRO570")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "C:PRO570" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "Test structure viewer" }),
  ).not.toBeInTheDocument();
});

it("distinguishes empty native records from invalid counts without fabricating a result", () => {
  const { rerender } = render(
    <EpitopeResults
      job={sourceJob()}
      value={{ epitope_residues: [] }}
      language="en"
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "No protein contact residues",
  );
  expect(screen.getByRole("button", { name: "Download table" })).toBeDisabled();
  rerender(
    <EpitopeResults
      job={sourceJob()}
      value={{ epitope_residues: [{ ...contacts[0], contacts: NaN }] }}
      language="en"
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("incomplete");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

it("preserves duplicate native identities, exact zero counts, water entries and input order", () => {
  const native = [
    contacts[2],
    { ...contacts[0], contacts: 0 },
    { ...contacts[0], residue_name: "HOH" },
    contacts[2],
  ];
  const snapshot = JSON.stringify(native);
  const parsed = contactRecords(native);
  const protein = proteinContacts(parsed);
  expect(protein).toHaveLength(3);
  expect(protein.map((row) => row.contacts)).toEqual([30, 30, 0]);
  expect(parsed[2]).toBe(native[2]);
  expect(JSON.stringify(native)).toBe(snapshot);
  expect(() => contactRecords(undefined)).toThrow();
  expect(() => contactRecords([{ ...contacts[0], contacts: -1 }])).toThrow();
  expect(() => contactRecords([{ ...contacts[0], contacts: "32" }])).toThrow();
});
