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
it("displays standard DNA nucleotide letters while retaining deposited residue labels", () => {
  const names = ["DA", "DC", "DG", "DT"];
  render(
    <StructureSequence
      language="zh"
      residues={names.map((resn, index) => ({
        key: `DNA-${index}`,
        chain: "DNA",
        resn,
        resi: index + 1,
        icode: "",
      }))}
      selected={[]}
      hiddenChains={[]}
      onSelect={vi.fn()}
      onClear={vi.fn()}
    />,
  );
  names.forEach((name, index) =>
    expect(
      screen.getByRole("checkbox", { name: `DNA:${name}${index + 1}` }),
    ).toHaveTextContent(name.slice(1)),
  );
});

it("compacts the position markers while retaining exact accessible residue identities", () => {
  const residues = Array.from({ length: 12 }, (_, index) => ({
    key: "A:" + index,
    chain: "A",
    resn: "GLY",
    resi: index + 101,
    icode: index === 4 ? "B" : "",
  }));
  render(
    <StructureSequence
      language="en"
      residues={residues}
      selected={[]}
      hiddenChains={[]}
      onSelect={vi.fn()}
      onClear={vi.fn()}
      compact
    />,
  );
  expect(screen.getByRole("checkbox", { name: "A:GLY102" })).toHaveTextContent(
    /^G$/,
  );
  expect(screen.getByRole("checkbox", { name: "A:GLY105B" })).toHaveTextContent(
    "105B",
  );
  expect(screen.getByRole("checkbox", { name: "A:GLY110" })).toHaveTextContent(
    "110",
  );
});
