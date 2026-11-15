import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  StructureDisplayControls,
  StructureSequence,
} from "./StructureInspection";
import { defaultOptions } from "./protocol";
import { StructureSelectionSummary } from "./StructureInspectionSummary";

it("shows exact observed selection identity and zero confidence, with display-only actions", () => {
  const residue = {
    key: "observed",
    chain: "AB",
    resn: "ASN",
    resi: 10,
    icode: "B",
  };
  const focus = vi.fn(),
    clear = vi.fn();
  const props = {
    language: "en" as const,
    residues: [residue],
    selected: [residue.key],
    selection: null,
    confidence: { key: "current", residueScores: { observed: 0 }, tokens: [] },
    onFocus: focus,
    onClear: clear,
  };
  const view = render(<StructureSelectionSummary {...props} />);
  expect(screen.getByText("AB:ASN10B")).toBeVisible();
  expect(screen.getByText("pLDDT 0.0")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Focus current selection" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Clear current selection" }),
  );
  expect(focus).toHaveBeenCalledOnce();
  expect(clear).toHaveBeenCalledOnce();
  view.rerender(<StructureSelectionSummary {...props} busy language="zh" />);
  expect(screen.getByRole("button", { name: "定位当前选择" })).toBeDisabled();
  view.rerender(<StructureSelectionSummary {...props} residues={[]} />);
  expect(
    screen.queryByRole("group", { name: "Current structure selection" }),
  ).toBeNull();
});

it("keeps atom selection distinct from residue scores and bounds unmapped confidence feedback", () => {
  const residue = {
    key: "A:ASN:10:",
    chain: "A",
    resn: "ASN",
    resi: 10,
    icode: "",
  };
  const props = {
    language: "en" as const,
    residues: [residue],
    selected: [residue.key],
    selection: {
      chain: "A",
      residue: "ASN10",
      atom: "ND2",
      element: "N",
      count: 1,
      pick_mode: "atom" as const,
    },
    confidence: {
      key: "current",
      residueScores: { [residue.key]: 97 },
      tokens: [],
    },
    onFocus: vi.fn(),
    onClear: vi.fn(),
  };
  const view = render(<StructureSelectionSummary {...props} />);
  expect(screen.getByText("ND2 (N)")).toBeVisible();
  expect(screen.queryByText(/pLDDT/)).toBeNull();
  view.rerender(
    <StructureSelectionSummary
      {...props}
      selection={null}
      selected={[]}
      nativeTokens={[1, 2]}
    />,
  );
  expect(screen.getByText("2 confidence positions")).toBeVisible();
  view.rerender(
    <StructureSelectionSummary
      {...props}
      selection={null}
      confidence={{
        key: "current",
        residueScores: { [residue.key]: NaN },
        tokens: [],
      }}
    />,
  );
  expect(screen.queryByText(/pLDDT/)).toBeNull();
});
it("represents mixed polymer and ligand confidence selections without assigning one residue's score to the selection", () => {
  const residue = {
    key: "polymer",
    chain: "A",
    resn: "ASN",
    resi: 10,
    icode: "",
  };
  const props = {
    language: "en" as const,
    residues: [residue],
    selected: [residue.key],
    selection: null,
    confidence: {
      key: "current",
      residueScores: { polymer: 97 },
      tokens: [
        { index: 0, chain: "A", residue: "polymer", label: "A:ASN10" },
        { index: 1, chain: "B", residue: "ligand", label: "B:LIG1 · C2" },
      ],
    },
    onFocus: vi.fn(),
    onClear: vi.fn(),
  };
  const view = render(
    <StructureSelectionSummary {...props} nativeTokens={[0, 1]} />,
  );
  expect(screen.getByText("1 residue · 1 confidence position")).toBeVisible();
  expect(screen.getByText(/B:LIG1 · C2/)).toBeVisible();
  expect(screen.queryByText(/pLDDT/)).toBeNull();
  view.rerender(<StructureSelectionSummary {...props} nativeTokens={[0]} />);
  expect(screen.getByText("pLDDT 97.0")).toBeVisible();
});
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
it("disables individually hidden residues and offers renderer-owned restoration", () => {
  const restore = vi.fn();
  render(
    <StructureSequence
      language="en"
      residues={[
        { key: "hidden", chain: "A", resn: "ASN", resi: 10, icode: "B" },
        { key: "visible", chain: "A", resn: "GLY", resi: 11, icode: "" },
      ]}
      selected={[]}
      hiddenChains={[]}
      hiddenResidues={["hidden"]}
      onSelect={vi.fn()}
      onClear={vi.fn()}
      onRestore={restore}
    />,
  );
  expect(screen.getByRole("checkbox", { name: "A:ASN10B" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "A:GLY11" })).toBeEnabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Restore structure display" }),
  );
  expect(restore).toHaveBeenCalledOnce();
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
