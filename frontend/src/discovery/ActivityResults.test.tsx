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
const clipboardBeforeTest = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
afterEach(() => {
  cleanup();
  if (clipboardBeforeTest)
    Object.defineProperty(navigator, "clipboard", clipboardBeforeTest);
  else Reflect.deleteProperty(navigator, "clipboard");
});

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
    const preview = () =>
      screen.getByRole("region", {
        name:
          language === "zh"
            ? "选中记录的分子结构"
            : "Selected reported molecule",
      });
    expect(within(preview()).getByTestId("selected-drawing")).toHaveTextContent(
      "Nc1ccccc1",
    );
    const second = screen.getByText("Ki").closest("tr")!;
    fireEvent.keyDown(second, { key: "Enter" });
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(within(preview()).getByTestId("selected-drawing")).toHaveTextContent(
      "Oc1ccccc1",
    );
    expect(preview()).toHaveTextContent("Ki < 35.0 uM");
    expect(preview()).not.toHaveTextContent("IC50");
    const missing = screen.getByText("Kd").closest("tr")!;
    fireEvent.click(missing);
    expect(
      within(preview()).queryByTestId("selected-drawing"),
    ).not.toBeInTheDocument();
    expect(preview()).toHaveTextContent(
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

it("copies and imports the selected record even when source activity IDs are repeated", async () => {
  const evidence = {
    asset_id: "activity-analysis",
    sha256: "a".repeat(64),
    record: 0,
    conformer: 0,
  };
  const duplicate = {
    ...rows[1],
    activity_id: rows[0].activity_id,
    molecule_chembl_id: "CHEMBL-C",
  };
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const onImport = vi.fn();
  render(
    <ActivityResults
      result={{
        ...result,
        analysis_reference: evidence,
        activities: { ...result.activities!, rows: [rows[0], duplicate] },
      }}
      language="en"
      onImport={onImport}
    />,
  );
  fireEvent.click(screen.getByText("Ki").closest("tr")!);
  const preview = screen.getByRole("region", {
    name: "Selected reported molecule",
  });
  expect(within(preview).getByTestId("selected-drawing")).toHaveTextContent(
    "CHEMBL-C · Oc1ccccc1",
  );
  fireEvent.click(within(preview).getByRole("button", { name: "Copy SMILES" }));
  expect(await within(preview).findByRole("status")).toHaveTextContent(
    "Molecular structure copied.",
  );
  expect(writeText).toHaveBeenCalledExactlyOnceWith(duplicate.canonical_smiles);
  fireEvent.click(
    within(preview).getByRole("button", { name: "Import compound" }),
  );
  expect(onImport).toHaveBeenCalledExactlyOnceWith({
    source: "chembl",
    identifier: "CHEMBL-C",
    evidence,
    activity_id: duplicate.activity_id,
  });
});

it.each(["en", "zh"] as const)(
  "keeps source validity visible without opening optional assay columns in %s",
  (language) => {
    const comment = "Outside typical range";
    const noted = {
      ...result,
      activities: {
        ...result.activities!,
        rows: result.activities!.rows.map((row, index) => ({
          ...row,
          data_validity_comment: index === 0 ? comment : null,
        })),
      },
    };
    const original = JSON.stringify(noted);
    render(<ActivityResults result={noted} language={language} />);
    const preview = () =>
      screen.getByRole("region", {
        name:
          language === "zh"
            ? "选中记录的分子结构"
            : "Selected reported molecule",
      });
    const table = screen.getByRole("table");
    expect(
      within(table).queryByRole("columnheader", {
        name: language === "zh" ? "实验" : "Assay",
      }),
    ).not.toBeInTheDocument();
    for (const area of [table, preview()]) {
      expect(within(area).getByRole("note")).toHaveTextContent(comment);
      expect(within(area).getByRole("note")).toHaveTextContent(
        language === "zh" ? "来源有效性备注：" : "Source validity note:",
      );
      expect(within(area).getByRole("note")).toBeVisible();
    }
    fireEvent.click(screen.getByText("Ki").closest("tr")!);
    expect(within(preview()).queryByRole("note")).not.toBeInTheDocument();
    expect(within(table).getByRole("note")).toHaveTextContent(comment);
    expect(JSON.stringify(noted)).toBe(original);
  },
);
