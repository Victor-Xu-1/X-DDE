import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ConfidencePlddt } from "./ConfidencePlddt";
import type { Confidence } from "./confidence-data";
import type { ConfidenceInspection } from "../viewer/confidence-types";

vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: ({ onPoint }: { onPoint?(point: { x: number }): void }) => (
    <button onClick={() => onPoint?.({ x: 31 })}>
      Select displayed endpoint
    </button>
  ),
}));
const native: Confidence = {
  metric: "pae",
  token_count: 32,
  indices: [0, 31],
  stride: 31,
  matrix: [
    [0, 1],
    [2, 0],
  ],
  atom_plddt: [],
  atom_stride: 1,
  token_plddt: [
    { index: 0, value: 0.1 },
    { index: 31, value: 0.9 },
  ],
  token_plddt_unit: "0-1",
  native_artifact: "pae.npz",
};
const inspection: ConfidenceInspection = {
  key: "verified",
  residueScores: {},
  tokens: Array.from({ length: 32 }, (_, index) => ({
    index,
    chain: "A",
    residue: `A:ALA:${index + 1}:`,
    label: `A:ALA${index + 1}`,
  })),
};
it("selects the exact native token, including a sampled endpoint rather than its displayed array position", () => {
  const select = vi.fn();
  render(
    <ConfidencePlddt
      data={native}
      language="en"
      inspection={inspection}
      onTokens={select}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Select displayed endpoint" }),
  );
  expect(select).toHaveBeenCalledWith([31]);
});
it("rejects late point events after mapping becomes unavailable and never treats an atom index as a token", () => {
  const select = vi.fn();
  const view = render(
    <ConfidencePlddt
      data={native}
      language="en"
      inspection={null}
      onTokens={select}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Select displayed endpoint" }),
  );
  expect(select).not.toHaveBeenCalled();
  view.rerender(
    <ConfidencePlddt
      data={{
        ...native,
        token_plddt: undefined,
        atom_plddt: [{ index: 31, value: 0.9 }],
        atom_plddt_unit: "0-1",
      }}
      language="en"
      inspection={inspection}
      onTokens={select}
    />,
  );
  fireEvent.click(screen.getByText("Atom confidence"));
  fireEvent.click(
    screen.getByRole("button", { name: "Select displayed endpoint" }),
  );
  expect(select).not.toHaveBeenCalled();
});

it("keeps an explicitly expanded atom-confidence curve open while linked parent state updates", async () => {
  const atoms = {
    ...native,
    token_plddt: undefined,
    atom_plddt: [{ index: 31, value: 0.9 }],
    atom_plddt_unit: "0-1",
  };
  const view = render(
    <ConfidencePlddt data={atoms} language="en" inspection={inspection} />,
  );
  const summary = screen.getByText("Atom confidence");
  const details = summary.closest("details")!;
  expect(details).not.toHaveAttribute("open");
  fireEvent.click(summary);
  await waitFor(() => expect(details).toHaveAttribute("open"));
  view.rerender(
    <ConfidencePlddt
      data={atoms}
      language="en"
      inspection={{ ...inspection }}
    />,
  );
  expect(details).toHaveAttribute("open");
  expect(
    screen.getByRole("button", { name: "Select displayed endpoint" }),
  ).toBeVisible();
});
