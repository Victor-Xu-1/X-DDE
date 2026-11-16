import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import type { StructureViewerProps } from "../viewer/StructureViewport";
import type { SceneInfo } from "../viewer/protocol";
import { EpitopeResults } from "./EpitopeResults";

const driver = vi.hoisted(() => ({
  current: null as StructureViewerProps | null,
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: (props: StructureViewerProps) => {
    driver.current = props;
    return <div aria-label="Native viewer boundary" />;
  },
}));
afterEach(cleanup);

const asset = "a97d8c4f-4562-4387-abc5-16f569581271";
function sourceJob(sha = "a".repeat(64)) {
  return {
    id: "retained-contact-task",
    request: {
      operation: "harness",
      payload: { structure_path: "asset:" + asset },
      scientific_inputs: [
        {
          asset_id: asset,
          sha256: sha,
          record: 0,
          conformer: 0,
          version_id: sha,
        },
      ],
    },
  } as unknown as Job;
}
const contacts = [
  { chain: "C", residue_id: 45, residue_name: "GLU", contacts: 57 },
  { chain: "C", residue_id: 43, residue_name: "LEU", contacts: 44 },
  { chain: "C", residue_id: 46, residue_name: "ILE", contacts: 12 },
];
const scene: SceneInfo = {
  chains: ["C"],
  atoms: 30,
  hasPolymer: true,
  ligands: [],
  residues: [
    { key: "C:GLU45", chain: "C", resn: "GLU", resi: 45, icode: "" },
    { key: "C:LEU43A", chain: "C", resn: "LEU", resi: 43, icode: "A" },
    { key: "C:LEU43B", chain: "C", resn: "LEU", resi: 43, icode: "B" },
    { key: "C:ILE46A", chain: "C", resn: "ILE", resi: 46, icode: "A" },
  ],
};
function loaded() {
  act(() => driver.current?.onSceneLoaded?.(scene));
}

it("binds the stored coordinate digest and docks sequence controls outside the native view", () => {
  const { container } = render(
    <EpitopeResults
      job={sourceJob()}
      value={{ epitope_residues: contacts }}
      language="en"
    />,
  );
  expect(driver.current?.sourceSnapshot).toBe(true);
  expect(driver.current?.expectedStructureSha256).toBe("a".repeat(64));
  expect(driver.current?.sequenceHost).toBe(
    container.querySelector(".structure-workbench-sequence"),
  );
  expect(driver.current?.sequenceHost).toBeInstanceOf(HTMLElement);
});

it("enables only unique loaded residues, preserving native rows and real insertion codes", async () => {
  const original = JSON.stringify(contacts);
  render(
    <EpitopeResults
      job={sourceJob()}
      value={{ epitope_residues: contacts }}
      language="en"
    />,
  );
  const glutamate = screen.getByRole("button", { name: "C:GLU45" });
  expect(glutamate).toBeDisabled();
  loaded();
  expect(glutamate).toBeEnabled();
  expect(screen.getByRole("button", { name: "C:LEU43" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "C:ILE46" }));
  expect(driver.current?.focusResidue?.residue).toBe("C:ILE46A");
  expect(screen.getByRole("button", { name: "C:ILE46" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(JSON.stringify(contacts)).toBe(original);
});

it("revokes stale focus on source failure and recovers without discarding contact results", async () => {
  render(
    <EpitopeResults
      job={sourceJob()}
      value={{ epitope_residues: contacts }}
      language="en"
    />,
  );
  loaded();
  const control = screen.getByRole("button", { name: "C:GLU45" });
  await userEvent.click(control);
  expect(control).toHaveAttribute("aria-pressed", "true");
  act(() => driver.current?.onStructureVerification?.(false));
  expect(control).toBeDisabled();
  expect(driver.current?.focusResidue).toBeNull();
  expect(screen.getByText("57")).toBeVisible();
  loaded();
  expect(control).toBeEnabled();
  expect(control).toHaveAttribute("aria-pressed", "false");
});

it("isolates a different declared source even when the task and asset identifiers repeat", async () => {
  const { rerender } = render(
    <EpitopeResults
      job={sourceJob()}
      value={{ epitope_residues: contacts }}
      language="zh"
    />,
  );
  loaded();
  await userEvent.click(screen.getByRole("button", { name: "C:GLU45" }));
  const oldSceneCallback = driver.current?.onSceneLoaded;
  rerender(
    <EpitopeResults
      job={sourceJob("b".repeat(64))}
      value={{ epitope_residues: contacts }}
      language="zh"
    />,
  );
  act(() => oldSceneCallback?.(scene));
  expect(driver.current?.expectedStructureSha256).toBe("b".repeat(64));
  expect(driver.current?.focusResidue).toBeNull();
  expect(screen.getByRole("button", { name: "C:GLU45" })).toBeDisabled();
});
