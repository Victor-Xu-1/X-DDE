import { readFileSync } from "node:fs";
import { afterAll, expect, it, vi } from "vitest";
const worker = vi.hoisted(() =>
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:display-worker"),
);
afterAll(() => worker.mockRestore());
import {
  GLModel,
  type GLViewer,
  type AtomSpec,
  type AtomSelectionSpec,
} from "3dmol";
import { focusDisplayContext } from "./context-focus";

function fixture() {
  const model = new GLModel(0);
  model.addMolData(
    readFileSync(
      new URL(
        "../../../server_tests/fixtures/surface-3mxf.pdb",
        import.meta.url,
      ),
      "utf8",
    ),
    "pdb",
  );
  const viewer = {
    selectedAtoms: (selection: AtomSelectionSpec) =>
      model.selectedAtoms(selection),
    zoomTo: vi.fn(),
    zoom: vi.fn(),
    render: vi.fn(),
  } as unknown as GLViewer;
  return { model, viewer };
}
const source = (atoms: AtomSpec[]) =>
  atoms.map((atom) => ({
    index: atom.index,
    serial: atom.serial,
    x: atom.x,
    y: atom.y,
    z: atom.z,
    bonds: atom.bonds,
    bondOrder: atom.bondOrder,
  }));

it("frames a real protein residue with surrounding source atoms, rather than magnifying the residue alone", () => {
  const { model, viewer } = fixture();
  const all = model.selectedAtoms({}),
    before = source(all),
    anchor = all.find((atom) => atom.atom === "CA")!;
  const residue = model.selectedAtoms({
    chain: anchor.chain,
    resi: anchor.resi,
  });
  expect(
    focusDisplayContext(viewer, residue, null, { width: 700, height: 500 }),
  ).toBe(true);
  const selection = vi.mocked(viewer.zoomTo).mock.calls[0][0]!;
  expect(selection.model).toBe(0);
  const context = model.selectedAtoms(selection);
  expect(context.length).toBeGreaterThan(residue.length);
  expect(context.every((atom) => all.includes(atom))).toBe(true);
  expect(source(all)).toEqual(before);
  expect(viewer.zoom).toHaveBeenCalledWith(0.85);
});

it("fits a portrait stage and only allows an explicitly paired model into the camera context", () => {
  const { model, viewer } = fixture();
  expect(
    focusDisplayContext(viewer, model.selectedAtoms({}).slice(0, 1), 1, {
      width: 300,
      height: 500,
    }),
  ).toBe(true);
  expect(vi.mocked(viewer.zoomTo).mock.calls[0][0]!.model).toEqual([0, 1]);
  expect(viewer.zoom).toHaveBeenCalledWith(0.51);
});

it("does not reset or move a view when selection coordinates are empty or non-finite", () => {
  const { viewer } = fixture();
  for (const anchors of [
    [],
    [{ x: NaN, y: 1, z: 2 }],
    [{ x: 1, y: Infinity, z: 2 }],
    [{ x: 1, y: 2 }],
  ])
    expect(focusDisplayContext(viewer, anchors, null)).toBe(false);
  expect(viewer.zoomTo).not.toHaveBeenCalled();
  expect(viewer.render).not.toHaveBeenCalled();
});
