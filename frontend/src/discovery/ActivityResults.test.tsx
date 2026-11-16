import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ActivityResults } from "./ActivityResults";
import type { TargetResearchResult } from "./types";

vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({
    source,
    label,
    compact,
  }: {
    source: { smiles: string } | null;
    label: string;
    compact?: boolean;
  }) => (
    <span data-testid={compact ? "thumbnail" : "selected-drawing"}>
      {label} · {source?.smiles}
    </span>
  ),
}));
afterEach(cleanup);

const rows = [
  {
    activity_id: 101,
    molecule_chembl_id: "CHEMBL-A",
    canonical_smiles: "Nc1ccccc1",
    standard_type: "IC50",
    standard_relation: "=",
    standard_value: "190.0",
    standard_units: "nM",
    assay_chembl_id: "ASSAY-1",
    assay_description: "First assay",
  },
  {
    activity_id: 102,
    molecule_chembl_id: "CHEMBL-A",
    canonical_smiles: "Oc1ccccc1",
    standard_type: "Ki",
    standard_relation: "<",
    standard_value: "35.0",
    standard_units: "uM",
    assay_chembl_id: "ASSAY-2",
    assay_description: "Second assay",
  },
  {
    activity_id: 103,
    molecule_chembl_id: "CHEMBL-B",
    standard_type: "Kd",
    standard_relation: ">",
    standard_value: "80",
    standard_units: "nM",
    assay_chembl_id: "ASSAY-3",
    assay_description: "No source structure",
  },
];
const result = {
  activities: { total: 206, rows },
} as unknown as TargetResearchResult;

it.each(["en", "zh"] as const)(
  "inspects the exact activity, including duplicate molecule identifiers, in %s",
  (language) => {
    const before = JSON.stringify(result);
    render(<ActivityResults result={result} language={language} />);
    const preview = screen.getByRole("region", {
      name:
        language === "zh" ? "选中记录的分子结构" : "Selected reported molecule",
    });
    expect(within(preview).getByTestId("selected-drawing")).toHaveTextContent(
      "Nc1ccccc1",
    );
    const second = screen.getByText("ASSAY-2").closest("tr")!;
    fireEvent.keyDown(second, { key: "Enter" });
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(within(preview).getByTestId("selected-drawing")).toHaveTextContent(
      "Oc1ccccc1",
    );
    expect(preview).toHaveTextContent("Ki < 35.0 uM");
    expect(preview).not.toHaveTextContent("IC50");
    const missing = screen.getByText("ASSAY-3").closest("tr")!;
    fireEvent.click(missing);
    expect(
      within(preview).queryByTestId("selected-drawing"),
    ).not.toBeInTheDocument();
    expect(preview).toHaveTextContent(
      language === "zh"
        ? "来源记录未提供分子结构。"
        : "The source record does not provide a molecular structure.",
    );
    expect(JSON.stringify(result)).toBe(before);
  },
);

it("does not leave a previous molecule when the source result becomes empty", () => {
  const { rerender } = render(
    <ActivityResults result={result} language="en" />,
  );
  rerender(
    <ActivityResults
      result={{ ...result, activities: { total: 0, rows: [], status: "ok" } }}
      language="en"
    />,
  );
  expect(screen.queryByTestId("selected-drawing")).not.toBeInTheDocument();
  expect(
    screen.getByText("No matching results. Adjust the search."),
  ).toBeVisible();
});
