import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  StructureDisplayControls,
  StructureSequence,
} from "./StructureInspection";
import { defaultOptions } from "./protocol";
it("exposes native representation switches without changing unrelated options", () => {
  const change = vi.fn();
  render(
    <StructureDisplayControls
      language="en"
      options={defaultOptions}
      onChange={change}
    />,
  );
  fireEvent.click(screen.getByRole("switch", { name: "All atoms" }));
  expect(change).toHaveBeenLastCalledWith({ allAtoms: true });
  fireEvent.click(screen.getByRole("switch", { name: "Side chains" }));
  expect(change).toHaveBeenLastCalledWith({ sideChains: true });
});
it("uses exact observed identities, keyboard-accessible selection and modifiers; hidden chains cannot be selected", () => {
  const rows = [
    { key: "native-a", chain: "A", resn: "ASN", resi: 10, icode: "B" },
    { key: "native-b", chain: "AB", resn: "GLY", resi: 10, icode: "" },
  ];
  const choose = vi.fn(),
    clear = vi.fn();
  render(
    <StructureSequence
      language="en"
      residues={rows}
      selected={["native-a"]}
      hiddenChains={["AB"]}
      onSelect={choose}
      onClear={clear}
    />,
  );
  const residue = screen.getByRole("checkbox", { name: "A:ASN10B" });
  expect(residue).toHaveAttribute("aria-checked", "true");
  expect(residue).toHaveTextContent("N");
  fireEvent.click(residue, { shiftKey: true });
  expect(choose).toHaveBeenLastCalledWith("native-a", "range");
  fireEvent.click(residue, { metaKey: true });
  expect(choose).toHaveBeenLastCalledWith("native-a", "toggle");
  expect(screen.getByRole("checkbox", { name: "AB:GLY10" })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Clear sequence selection" }),
  );
  expect(clear).toHaveBeenCalledOnce();
});
