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
  MolecularPreview: ({ source }: { source: { smiles: string } }) => (
    <output aria-label="Original molecular identity">{source.smiles}</output>
  ),
}));
afterEach(cleanup);

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
