import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DiffReview } from "./DiffReview";
import { optionsFor, residueFromSelection } from "./model";

vi.mock("./ReviewReference", () => ({
  ReviewReference: ({
    reference,
  }: {
    reference: { asset_id: string; record: number };
  }) => (
    <span>
      {reference.asset_id} · Record {reference.record + 1}
    </span>
  ),
}));
const protein = {
  asset_id: "receptor",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const molecule = {
  asset_id: "candidate",
  sha256: "b".repeat(64),
  record: 2,
  conformer: 0,
};
const base = {
  mode: "generate" as const,
  language: "en" as const,
  taskLabel: "Generation",
  name: "Study",
  protein,
  molecule,
  collection: [molecule],
  pocket: {
    kind: "residues" as const,
    residues: [
      residueFromSelection(protein, "A", 544),
      residueFromSelection(protein, "A", 562),
    ],
  },
  options: { ...optionsFor("generate"), count: 10, seed: 17, steps: 250 },
  fixed: [0, 2],
  chains: "A",
  removeWater: true,
  keepLigands: false,
  removeH: false,
};

it.each(["en", "zh"] as const)(
  "reviews the actual selected site/model/budget in %s without a generic input promise",
  (language) => {
    render(<DiffReview {...base} language={language} />);
    expect(screen.getByText("receptor · Record 1")).toBeInTheDocument();
    expect(screen.queryByText("candidate · Record 3")).toBeNull();
    expect(screen.getByText(/A:544, A:562/)).toBeInTheDocument();
    expect(
      screen.getByText(
        language === "en"
          ? "Full atom · crossdocked · Conditional"
          : "全原子 · crossdocked · 条件生成",
      ),
    ).toBeVisible();
    expect(screen.getByText(/250.*17/)).toBeVisible();
    expect(screen.getByText("10", { selector: "dd" })).toBeVisible();
  },
);

it("tracks changes to the starting record, fixed core and model without rewriting source atom indices", () => {
  const options = {
    ...base.options,
    model: "moad_ca_cond",
    preserve_bonds: false,
  };
  const { rerender } = render(
    <DiffReview {...base} mode="inpaint" options={options} />,
  );
  expect(screen.getByText("candidate · Record 3")).toBeInTheDocument();
  expect(screen.getByText("Cα · moad · Conditional")).toBeVisible();
  expect(screen.getByText("Atom numbers: 1, 3")).toBeInTheDocument();
  expect(
    screen.getByText("Allow internal core bond changes"),
  ).toBeInTheDocument();
  rerender(
    <DiffReview
      {...base}
      mode="inpaint"
      molecule={{ ...molecule, record: 4 }}
      fixed={[1]}
      options={options}
    />,
  );
  expect(screen.queryByText("candidate · Record 3")).toBeNull();
  expect(screen.getByText("candidate · Record 5")).toBeInTheDocument();
  expect(screen.getByText("Atom numbers: 2")).toBeInTheDocument();
  expect(base.fixed).toEqual([0, 2]);
});

it("does not invent generation settings for export, pocket inspection or receptor preparation", () => {
  const { rerender } = render(
    <DiffReview
      {...base}
      mode="export"
      collection={[molecule, { ...molecule, record: 4 }]}
    />,
  );
  expect(screen.getByText("2 selected records")).toBeVisible();
  expect(screen.getByText("candidate · Record 5")).toBeInTheDocument();
  expect(screen.queryByText("Generation model")).toBeNull();
  expect(screen.queryByText("Receptor file")).toBeNull();
  rerender(<DiffReview {...base} mode="pocket" />);
  expect(screen.getByText("2 selected residues")).toBeVisible();
  expect(screen.queryByText("Candidate count")).toBeNull();
  rerender(<DiffReview {...base} mode="prepare" />);
  expect(
    screen.getByText("Remove water · Remove ligands · Retain source hydrogens"),
  ).toBeVisible();
  expect(screen.queryByText("Pocket scope")).toBeNull();
});

it("shows the actual optimization objective and population budget separately from the requested count", () => {
  render(
    <DiffReview
      {...base}
      mode="optimize"
      options={{
        ...optionsFor("optimize"),
        population: 12,
        rounds: 4,
        objective: "sa",
      }}
    />,
  );
  expect(screen.getByText("SA · 12 × 4 rounds")).toBeVisible();
});
