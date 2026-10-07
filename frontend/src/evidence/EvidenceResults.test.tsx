import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EvidenceResults } from "./EvidenceResults";
import { EvidencePlot } from "./EvidencePlot";
import type { EvidenceDocument, Observation } from "./types";
function row(
  id: string,
  value: number,
  relation: Observation["relation"] = "=",
  group = "group-one",
): Observation {
  return {
    id,
    source_row: 2,
    compound: id,
    molecule: null,
    material_kind: null,
    endpoint: "IC50",
    reported_value: String(value),
    reported_unit: "nM",
    relation,
    replicate: "",
    conditions: {
      target: "target",
      assay: "assay",
      species: "",
      construct_id: "",
      batch: "",
      temperature_c: null,
      ph: null,
      buffer: "",
      method: "",
    },
    value,
    normalized_value: value,
    normalized_unit: "nM",
    uncertainty: null,
    issues: [],
    comparison_group: group,
  };
}
describe("reported evidence presentation", () => {
  it("retains censoring and separates condition groups", () => {
    const rows = [
      row("A", 10),
      row("B", 50, ">"),
      row("C", 5, "=", "group-two"),
    ];
    render(
      <EvidenceResults
        language="en"
        value={
          {
            id: "source-record",
            request: {
              name: "Reported assay",
              citation: "Controlled report",
              source: { asset_id: "source" },
            },
            observations: rows,
            summaries: [],
          } as unknown as EvidenceDocument
        }
      />,
    );
    const table = screen.getByRole("table", { name: "Reported observations" });
    expect(within(table).getByText("> 50 nM")).toBeInTheDocument();
    expect(within(table).queryByText("C")).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("combobox", { name: /Comparison scope/ }),
      { target: { value: "group-two" } },
    );
    expect(
      within(
        screen.getByRole("table", { name: "Reported observations" }),
      ).getByText("C"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Download original experimental file" }),
    ).toHaveAttribute("href", "/api/assets/source");
  });
  it("shows negative reported percentage noise on a linear axis and preserves keyboard selection", () => {
    const negative = {
      ...row("Noise", -4),
      endpoint: "inhibition" as const,
      normalized_unit: "%",
      reported_unit: "%",
    };
    const pick = vi.fn();
    render(
      <EvidencePlot
        rows={[
          negative,
          { ...negative, id: "High", compound: "High", normalized_value: 104 },
        ]}
        language="en"
        onSelect={pick}
      />,
    );
    const point = screen.getByRole("button", { name: "Noise = -4 %" });
    fireEvent.keyDown(point, { key: "Enter" });
    expect(pick).toHaveBeenCalledWith(negative);
  });
});
