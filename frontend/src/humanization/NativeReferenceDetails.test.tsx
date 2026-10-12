import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { NativeReferenceDetails } from "./NativeReferenceDetails";
import type { EvaluationRow } from "./types";

vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: ({
    data,
    onPoint,
  }: {
    data: unknown;
    onPoint(p: { x: number }): void;
  }) => (
    <>
      <output data-testid="native-probabilities">{JSON.stringify(data)}</output>
      <button onClick={() => onPoint({ x: 2 })}>Select plotted position</button>
    </>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const scores = [0.123456789, 0.876543211].map((value, i) =>
  Object.fromEntries(
    "ACDEFGHIKLMNPQRSTVWY"
      .split("")
      .map((aa) => [aa, aa === "AC"[i] ? value : 0.02]),
  ),
);
const row = {
  source_sequence: "AC",
  original_scores: scores,
  proposal: null,
  numbering: ["A", "C"].map((aa, i) => ({
    source_position: i + 1,
    number: 111 + i,
    insertion: "",
    amino_acid: aa,
    region: "CDR3",
  })),
  original_evaluation: {
    peptides: [{ source_position: 1, sequence: "ACDEFGHIK", matched: false }],
  },
} as EvaluationRow;

it("plots exact native probabilities, links source positions and exports all 20 amino-acid probabilities", async () => {
  const original = JSON.stringify(row),
    selected = vi.fn(),
    user = userEvent.setup();
  let captured: Blob | undefined;
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((blob: Blob) => {
      captured = blob;
      return "blob:reference-export";
    }),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(
    <NativeReferenceDetails
      row={row}
      language="en"
      selectedPosition={null}
      onSelect={selected}
    />,
  );
  expect(
    JSON.parse(screen.getByTestId("native-probabilities").textContent!)[0].y,
  ).toEqual([0.123456789, 0.876543211]);
  await user.click(
    screen.getByRole("button", { name: "Select plotted position" }),
  );
  expect(selected).toHaveBeenCalledWith(2);
  await user.click(
    screen.getByText("Residue probabilities and export", { exact: true }),
  );
  const table = screen.getByRole("region", {
    name: "Original residue probabilities",
  });
  await user.click(within(table).getByRole("cell", { name: /^2$/ }));
  expect(selected).toHaveBeenCalledWith(2);
  expect(screen.getByTitle("0.123456789")).toHaveTextContent("0.1235");
  await user.click(
    within(table).getByRole("button", { name: "Export filtered rows" }),
  );
  const csv = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(captured!);
  });
  expect(csv).toContain('"P(A)"');
  expect(csv).toContain('"P(Y)"');
  expect(csv).toContain('"0.123456789"');
  expect(csv).toContain('"0.876543211"');
  await user.click(
    screen.getByText("OAS peptide matches and export", { exact: true }),
  );
  expect(
    screen.getByRole("table", { name: "Original-sequence OAS peptides" }),
  ).toHaveTextContent("No");
  expect(JSON.stringify(row)).toBe(original);
});
it("does not invent position probabilities when native detail is absent", () => {
  render(
    <NativeReferenceDetails
      row={{ ...row, original_scores: null }}
      language="en"
      selectedPosition={null}
      onSelect={vi.fn()}
    />,
  );
  expect(screen.queryByTestId("native-probabilities")).toBeNull();
});
