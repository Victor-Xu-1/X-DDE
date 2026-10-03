import { afterAll, expect, it, vi } from "vitest";
const worker = vi.hoisted(() =>
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:display-worker"),
);
afterAll(() => worker.mockRestore());
import {
  GLModel,
  type GLViewer,
  type AtomSelectionSpec,
  type AtomStyleSpec,
  type AtomSpec,
} from "3dmol";
import { MolecularScene } from "./scene";
import { paintOverlayModel } from "./style";
import { ligandBondRadius } from "./appearance";
const sdf =
  "Display protocol\n  RDKit          3D\n\n  3  2  0  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    1.2000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n   -1.2000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  2  0  0  0  0\n  1  3  1  0  0  0  0\nM  END\n$$$$\n";
function fixture(data = sdf, format = "sdf") {
  const model = new GLModel(0);
  model.addMolData(data, format);
  const clicks = vi.fn();
  const viewer = {
    selectedAtoms: model.selectedAtoms.bind(model),
    setStyle: model.setStyle.bind(model),
    addStyle: (selection: AtomSelectionSpec, style: AtomStyleSpec) =>
      model.setStyle(selection, style, true),
    setClickable: clicks,
    removeAllSurfaces: vi.fn(),
    removeAllLabels: vi.fn(),
    removeAllShapes: vi.fn(),
    addLabel: vi.fn(),
    addSurface: vi.fn().mockResolvedValue({}),
    render: vi.fn(),
  } as unknown as GLViewer;
  const scene = new MolecularScene(viewer, vi.fn());
  scene.inspect(false);
  return { model, scene, clicks };
}
function source(atoms: AtomSpec[]) {
  return atoms.map((a) => ({
    index: a.index,
    serial: a.serial,
    x: a.x,
    y: a.y,
    z: a.z,
    bonds: [...(a.bonds ?? [])],
    orders: [...(a.bondOrder ?? [])],
  }));
}
function expectSticks(atoms: AtomSpec[]) {
  for (const atom of atoms) {
    expect(atom.style?.sphere).toBeUndefined();
    expect(atom.style?.stick?.radius).toBe(ligandBondRadius);
  }
}
it("standalone ligands use thin element-colored sticks while keeping original coordinates and double bonds", async () => {
  const { model, scene } = fixture(),
    before = source(model.selectedAtoms({}));
  expect(scene.info.hasPolymer).toBe(false);
  expect(scene.options.pick).toBe("atom");
  await scene.paint();
  expectSticks(model.selectedAtoms({}));
  expect(model.selectedAtoms({})[0].style?.stick?.colorscheme).toBe(
    "greenCarbon",
  );
  expect(source(model.selectedAtoms({}))).toEqual(before);
  expect(before[0].orders).toContain(2);
});
it("molecule overlays use the same thin representation without atom balls", () => {
  const { model } = fixture(),
    before = source(model.selectedAtoms({}));
  paintOverlayModel(model, 0, true);
  expectSticks(model.selectedAtoms({}));
  expect(source(model.selectedAtoms({}))).toEqual(before);
});
it("region and point-selection highlights cannot inflate the molecule into balls", async () => {
  const { model, scene, clicks } = fixture(),
    before = source(model.selectedAtoms({}));
  await scene.highlightAtoms([0, 1]);
  expectSticks(model.selectedAtoms({}));
  const pick = clicks.mock.calls[0][2] as (atom: AtomSpec) => void;
  pick(model.selectedAtoms({})[2]);
  await scene.paint();
  expectSticks(model.selectedAtoms({}));
  await scene.action("stick");
  expectSticks(model.selectedAtoms({}));
  expect(source(model.selectedAtoms({}))).toEqual(before);
});
it.each(["cartoon", "pocket", "surface"] as const)(
  "ligands remain thin in the protein %s view",
  async (mode) => {
    const pdb =
      "ATOM      1  CA  ALA A   1       0.000   0.000   0.000  1.00 20.00           C  \nATOM      2  N   ALA A   1       1.300   0.000   0.000  1.00 20.00           N  \nHETATM    3  C1  LIG B   2       0.000   2.000   0.000  1.00 20.00           C  \nHETATM    4  O1  LIG B   2       1.200   2.000   0.000  1.00 20.00           O  \nCONECT    3    4\nCONECT    4    3\nEND\n";
    const { model, scene } = fixture(pdb, "pdb"),
      before = source(model.selectedAtoms({}));
    scene.options.mode = mode;
    await scene.paint();
    expectSticks(model.selectedAtoms({ hetflag: true }));
    expect(
      model.selectedAtoms({ hetflag: false })[0].style?.cartoon,
    ).toBeDefined();
    expect(source(model.selectedAtoms({}))).toEqual(before);
  },
);
