import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { StructureViewer } from "../viewer/StructureViewer";
import type { SceneInfo } from "../viewer/protocol";
import { ScientificSelection } from "./ScientificSelection";

const scene: SceneInfo = {
  chains: ["A", "B"],
  atoms: 1200,
  hasPolymer: true,
  residues: [
    { key: "A:TYR:42:B", chain: "A", resn: "TYR", resi: 42, icode: "B" },
  ],
  ligands: [{ key: "B:LIG301", chain: "B", resn: "LIG", resi: 301, icode: "" }],
};
const callbacks: NonNullable<
  ComponentProps<typeof StructureViewer>["onSceneLoaded"]
>[] = [];
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: (props: ComponentProps<typeof StructureViewer>) => {
    callbacks.push(props.onSceneLoaded!);
    return (
      <div
        aria-label="Source structure preview"
        data-focused-ligand={props.focusLigand}
      >
        <button type="button" onClick={() => props.onSceneLoaded?.(scene)}>
          Read structure
        </button>
        <button
          type="button"
          onClick={() =>
            props.onAtomSelected?.({
              chain: "A",
              residue: "TYR42B",
              atom: "CA",
              element: "C",
              count: 1,
              identity: {
                chain: "A",
                number: 42,
                insertion_code: "B",
                alternate_location: "",
                is_ligand: false,
              },
            })
          }
        >
          Pick source residue
        </button>
        <button
          type="button"
          onClick={() =>
            props.onAtomSelected?.({
              chain: "B",
              residue: "LIG301",
              atom: "C1",
              element: "C",
              count: 1,
              identity: {
                chain: "B",
                number: 301,
                insertion_code: "",
                alternate_location: "",
                is_ligand: true,
              },
            })
          }
        >
          Pick source ligand
        </button>
      </div>
    );
  },
}));
afterEach(() => {
  cleanup();
  callbacks.length = 0;
});
const source = {
  asset_id: "source-a",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
  version_id: null,
};
it("requires a real scene choice and preserves the selected ligand's chain and number", async () => {
  const update = vi.fn(),
    user = userEvent.setup();
  const props = {
    program: "plip" as const,
    language: "en" as const,
    payload: { kind: "plip" as const },
    onChange: update,
    onValid: vi.fn(),
    structure: source,
  };
  const { rerender } = render(<ScientificSelection {...props} />);
  expect(
    screen.getByLabelText("Ligand to analyze", { exact: true }),
  ).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Read structure" }));
  await user.selectOptions(
    screen.getByLabelText("Ligand to analyze", { exact: true }),
    "B:301",
  );
  expect(update).toHaveBeenCalledExactlyOnceWith({
    ligand_chain: "B",
    ligand_number: 301,
  });
  rerender(
    <ScientificSelection
      {...props}
      payload={{ kind: "plip", ligand_chain: "B", ligand_number: 301 }}
    />,
  );
  expect(screen.getByLabelText("Source structure preview")).toHaveAttribute(
    "data-focused-ligand",
    "B:LIG301",
  );
  rerender(
    <ScientificSelection
      {...props}
      payload={{ kind: "plip", ligand_chain: "B", ligand_number: 999 }}
    />,
  );
  expect(screen.getByLabelText("Source structure preview")).not.toHaveAttribute(
    "data-focused-ligand",
  );
});
it("preserves insertion codes and ignores a ligand when selecting redesign residues", async () => {
  const update = vi.fn(),
    user = userEvent.setup();
  const props = {
    program: "ligandmpnn" as const,
    language: "en" as const,
    payload: { kind: "ligandmpnn" as const, redesigned_residues: [] },
    onChange: update,
    onValid: vi.fn(),
    structure: source,
  };
  const { rerender } = render(<ScientificSelection {...props} />);
  await user.click(screen.getByRole("button", { name: "Pick source ligand" }));
  expect(update).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Pick source residue" }));
  expect(update).toHaveBeenLastCalledWith({ redesigned_residues: ["A42B"] });
  rerender(
    <ScientificSelection
      {...props}
      payload={{ kind: "ligandmpnn", redesigned_residues: ["A42B"] }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Remove residue A42B" }));
  expect(update).toHaveBeenLastCalledWith({ redesigned_residues: [] });
});
it("offers the actual residue list with the same exact identity as a 3D selection", async () => {
  const update = vi.fn(),
    user = userEvent.setup();
  render(
    <ScientificSelection
      program="ligandmpnn"
      language="en"
      payload={{ kind: "ligandmpnn", redesigned_residues: [] }}
      onChange={update}
      onValid={vi.fn()}
      structure={source}
    />,
  );
  const choice = screen.getByRole("combobox", {
    name: "Add a residue from the list",
  });
  expect(choice).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Read structure" }));
  await user.selectOptions(choice, "A:TYR:42:B");
  expect(update).toHaveBeenCalledExactlyOnceWith({
    redesigned_residues: ["A42B"],
  });
});
it("uses the scene's exact chain identities for target selection", async () => {
  const update = vi.fn(),
    user = userEvent.setup();
  render(
    <ScientificSelection
      program="boltzgen"
      language="zh"
      payload={{ kind: "boltzgen", target_chains: [] }}
      onChange={update}
      onValid={vi.fn()}
      structure={source}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Read structure" }));
  await user.click(screen.getByRole("checkbox", { name: "链 B" }));
  expect(update).toHaveBeenCalledExactlyOnceWith({ target_chains: ["B"] });
});
it("does not resurrect a previous source scene after changing the structure", async () => {
  const props = {
    program: "plip" as const,
    language: "en" as const,
    payload: { kind: "plip" as const },
    onChange: vi.fn(),
    onValid: vi.fn(),
    structure: source,
  };
  const { rerender } = render(<ScientificSelection {...props} />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Read structure" }));
  const prior = callbacks[0];
  rerender(
    <ScientificSelection
      {...props}
      structure={{ ...source, asset_id: "source-b", sha256: "b".repeat(64) }}
    />,
  );
  act(() => prior(scene));
  expect(
    screen.getByLabelText("Ligand to analyze", { exact: true }),
  ).toBeDisabled();
  expect(screen.queryByRole("option", { name: "LIG · B:301" })).toBeNull();
});
