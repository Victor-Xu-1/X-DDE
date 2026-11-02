import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { RestraintEditor } from "./RestraintEditor";
import type { SelectionInfo } from "../viewer/protocol";

const source = {
  asset_id: "11111111-1111-4111-8111-111111111111",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({
    onAtomSelected,
    sourceSnapshot,
  }: {
    onAtomSelected(value: SelectionInfo): void;
    sourceSnapshot: boolean;
  }) => (
    <div>
      <span>{sourceSnapshot ? "Exact source frame" : "Mutable pose"}</span>
      {["CA", "C"].map((atom, index) => (
        <button
          key={atom}
          type="button"
          onClick={() =>
            onAtomSelected({
              pick_mode: "atom",
              chain: "A",
              residue: "ALA8",
              atom,
              element: "C",
              count: 1,
              position: [index * 3, 0, 0],
              identity: {
                chain: "A",
                number: 8,
                insertion_code: "",
                alternate_location: "",
              },
              source_atom_index: index,
            })
          }
        >
          Pick {atom}
        </button>
      ))}
    </div>
  ),
}));
afterEach(cleanup);

it.each(["en", "zh"] as const)(
  "creates source-bound positional conditions from a3Dpick in %s",
  async (language) => {
    const user = userEvent.setup(),
      change = vi.fn(),
      zh = language === "zh";
    render(
      <RestraintEditor
        structure={source}
        value={[]}
        onChange={change}
        language={language}
      />,
    );
    expect(screen.getByText("Exact source frame")).toBeVisible();
    expect(
      screen.getByRole("button", { name: zh ? "添加到任务" : "Add to task" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Pick CA" }));
    await user.click(
      screen.getByRole("button", { name: zh ? "添加到任务" : "Add to task" }),
    );
    expect(change).toHaveBeenCalledWith([
      {
        kind: "position",
        atom: {
          role: "structure",
          source,
          chain: "A",
          number: 8,
          insertion: "",
          atom: "CA",
          index: null,
          position_angstrom: [0, 0, 0],
        },
        force_kj_mol_nm2: 1000,
      },
    ]);
  },
);

it("keeps the selected pair and explicit distance/force units", async () => {
  const user = userEvent.setup(),
    change = vi.fn();
  render(
    <RestraintEditor
      structure={source}
      value={[]}
      onChange={change}
      language="en"
    />,
  );
  await user.selectOptions(
    screen.getByLabelText("What should be maintained?"),
    "distance",
  );
  await user.click(screen.getByRole("button", { name: "Pick CA" }));
  await user.click(screen.getByRole("button", { name: "Pick C" }));
  expect(screen.getByLabelText("Target distance (Å)")).toHaveValue(3);
  await user.clear(screen.getByLabelText("Target distance (Å)"));
  await user.type(screen.getByLabelText("Target distance (Å)"), "2");
  await user.selectOptions(
    screen.getByLabelText("Restraint strength"),
    "10000",
  );
  await user.click(screen.getByRole("button", { name: "Add to task" }));
  expect(change.mock.calls[0][0][0]).toMatchObject({
    kind: "distance",
    distance_angstrom: 2,
    force_kj_mol_nm2: 10000,
    first: { atom: "CA", source },
    second: { atom: "C", source },
  });
});
