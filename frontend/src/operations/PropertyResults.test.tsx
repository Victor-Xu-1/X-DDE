import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job, LigandProperties } from "../types";
import { PropertyResults } from "./PropertyResults";

vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: () => null,
}));
vi.mock("../presentation/MoleculeImage", () => ({ MoleculeImage: () => null }));
vi.mock("../presentation/MolecularPreview", () => ({
  MolecularPreview: ({
    source,
    urls,
    records,
  }: {
    source: { smiles?: string; url?: string; record?: number };
    urls?: string[];
    records?: number[];
  }) => (
    <>
      <output aria-label="Original molecular identity">{source.smiles}</output>
      <output aria-label="Exact preview file">
        {JSON.stringify({ source, urls, records })}
      </output>
    </>
  ),
}));
afterEach(cleanup);

it("selects the source file's exact native record for 2D and 3D instead of rebuilding its SMILES", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const molecules = [
    {
      input: id + ":2",
      name: "Native second record",
      available: true,
      smiles: "CCC(=O)N",
    },
    {
      input: id + ":1",
      name: "Native first record",
      available: true,
      smiles: "CC(=O)N",
    },
  ];
  const original = JSON.stringify(molecules);
  render(
    <PropertyResults
      language="en"
      molecules={molecules}
      job={
        {
          id: "native",
          request: {
            operation: "properties",
            name: "Preserved file",
            ligand_files: [id],
          },
        } as Job
      }
    />,
  );
  expect(
    JSON.parse(screen.getByLabelText("Exact preview file").textContent!),
  ).toEqual({
    source: { url: "/api/assets/" + id, record: 1 },
    urls: ["/api/assets/" + id],
    records: [1],
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Native first record", exact: true }),
  );
  expect(
    JSON.parse(screen.getByLabelText("Exact preview file").textContent!),
  ).toEqual({
    source: { url: "/api/assets/" + id, record: 0 },
    urls: ["/api/assets/" + id],
    records: [0],
  });
  expect(JSON.stringify(molecules)).toBe(original);
});

it("shows native compound identities in the table, selector and selected structure without rewriting data", async () => {
  const molecules = [
    {
      input: "asset:0",
      name: "CHEMBL123",
      available: true,
      smiles: "CC(=O)N",
      mw: 59.07,
      logp: -1.2,
    },
    {
      input: "asset:1",
      name: "CHEMBL456",
      available: true,
      smiles: "CC(=O)O",
      mw: 60.05,
      logp: 0.1,
    },
  ];
  const original = JSON.stringify(molecules);
  render(
    <PropertyResults
      job={{ id: "native", request: { name: "Measured STAT6 series" } } as Job}
      molecules={molecules}
      language="en"
    />,
  );
  expect(screen.getByRole("option", { name: "CHEMBL123" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "CHEMBL123" })).toBeVisible();
  expect(screen.getByRole("table")).toHaveTextContent("CHEMBL123");
  expect(JSON.stringify(molecules)).toBe(original);
});

it("links keyboard plot selection, original molecular identity and a reviewed new draft without modifying source records", async () => {
  const molecules: LigandProperties[] = [
    {
      input: "imatinib",
      available: true,
      smiles: "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1",
      mw: 493.615,
      logp: 4.59032,
      tpsa: 86.28,
      qed: 0.389416,
      sa: 2.33166,
      hbd: 2,
      hba: 7,
      rotatable_bonds: 7,
    },
    {
      input: "nilotinib",
      available: true,
      smiles:
        "Cc1cn(-c2cc(NC(=O)c3ccc(C)c(Nc4nccc(-c5cccnc5)n4)c3)cc(C(F)(F)F)c2)cn1",
      mw: 529.526,
      logp: 6.35584,
      tpsa: 97.62,
      qed: 0.26586,
      sa: 2.71032,
      hbd: 2,
      hba: 7,
      rotatable_bonds: 7,
    },
  ];
  const original = JSON.stringify(molecules),
    onDraft = vi.fn();
  render(
    <PropertyResults
      job={
        {
          id: "source-job",
          request: { name: "ABL series", project_id: null },
        } as Job
      }
      molecules={molecules}
      language="en"
      onDraft={onDraft}
    />,
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Inspect record" }),
    "1",
  );
  expect(
    screen.getByLabelText("Original molecular identity"),
  ).toHaveTextContent(molecules[1].smiles!);
  expect(onDraft).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Predict this molecule" }),
  );
  expect(onDraft.mock.lastCall![0].components[0].value).toBe(
    molecules[1].smiles,
  );
  expect(JSON.stringify(molecules)).toBe(original);
});
