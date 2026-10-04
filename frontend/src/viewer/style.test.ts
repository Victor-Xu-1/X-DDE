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
  "Display protocol\n  RDKit          3D\n\n  3  2  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    1.2000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n   -1.2000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  2  0  0  0  0\n  1  3  1  0  0  0  0\nM  END\n$$$$\n";
function fixture(data = sdf, format = "sdf") {
  const model = new GLModel(0);
  model.addMolData(data, format);
  expect(model.selectedAtoms({}).length).toBeGreaterThan(0);
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
    addCylinder: vi.fn(),
    addSurface: vi.fn().mockResolvedValue({}),
    render: vi.fn(),
    zoomTo: vi.fn(),
    zoom: vi.fn(),
  } as unknown as GLViewer;
  const emit = vi.fn(),
    scene = new MolecularScene(viewer, emit);
  scene.inspect(false, ["sdf", "mol", "mol2"].includes(format));
  return { model, scene, clicks, viewer, emit };
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
  await scene.highlightAtoms(
    model
      .selectedAtoms({})
      .slice(0, 2)
      .map((atom) => atom.serial!),
  );
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
    for (const limit of [3, 5, "all"] as const) {
      scene.options.contactLimit = limit;
      await scene.paint();
      expectSticks(model.selectedAtoms({ hetflag: true }));
      const backbone = model.selectedAtoms({ hetflag: false })[0].style
        ?.cartoon;
      expect(backbone?.opacity).toBeGreaterThanOrEqual(0.8);
      expect(backbone?.color).not.toBe("#b9c5c1");
      expect(source(model.selectedAtoms({}))).toEqual(before);
    }
  },
);

it("named MOL2 ligand substructures cannot be mistaken for polymer cartoons", async () => {
  const mol2 =
    "@<TRIPOS>MOLECULE\nDisplay protocol\n3 2 1 0 0\nSMALL\nNO_CHARGES\n\n@<TRIPOS>ATOM\n1 C1 0.0000 0.0000 0.0000 C.2 1 LIG 0.0000\n2 O1 1.2000 0.0000 0.0000 O.2 1 LIG 0.0000\n3 N1 -1.2000 0.0000 0.0000 N.3 1 LIG 0.0000\n@<TRIPOS>BOND\n1 1 2 2\n2 1 3 1\n@<TRIPOS>SUBSTRUCTURE\n1 LIG 1\n";
  const { model, scene } = fixture(mol2, "mol2");
  expect(scene.info.hasPolymer).toBe(false);
  await scene.paint();
  expectSticks(model.selectedAtoms({}));
  for (const atom of model.selectedAtoms({}))
    expect(atom.style?.cartoon).toBeUndefined();
});

it("receptor overlays keep a visible colored backbone without sidechain clutter", () => {
  const { model } = fixture(
    "ATOM      1  CA  ASN A 140       2.000   0.000   0.000  1.00 20.00           C  \nATOM      2  N   ASN A 140       3.300   0.000   0.000  1.00 20.00           N  \nEND\n",
    "pdb",
  );
  const before = source(model.selectedAtoms({}));
  paintOverlayModel(model, 0, false);
  expect(
    model.selectedAtoms({})[0].style?.cartoon?.opacity,
  ).toBeGreaterThanOrEqual(0.8);
  expect(model.selectedAtoms({})[0].style?.stick).toBeUndefined();
  expect(source(model.selectedAtoms({}))).toEqual(before);
});

it("pocket highlights retain the continuous backbone and original coordinates", async () => {
  const { model, scene } = fixture(
    "ATOM      1  CA  ALA A   1       0.000   0.000   0.000  1.00 20.00           C  \nATOM      2  CA  GLY A   2       3.800   0.000   0.000  1.00 20.00           C  \nEND\n",
    "pdb",
  );
  const before = source(model.selectedAtoms({}));
  await scene.highlightResidues([
    {
      model: 0,
      chain: "A",
      number: 1,
      insertion_code: "",
      alternate_location: "",
    },
  ]);
  for (const atom of model.selectedAtoms({}))
    expect(atom.style?.cartoon?.opacity).toBeGreaterThanOrEqual(0.8);
  expect(model.selectedAtoms({ resi: 1 })[0].style?.stick?.color).toBe(
    "#dc8e25",
  );
  expect(model.selectedAtoms({ resi: 2 })[0].style?.stick).toBeUndefined();
  expect(source(model.selectedAtoms({}))).toEqual(before);
});

it("surface mode requests a colored protein surface and publishes coverage only after mesh generation; switching back removes it", async () => {
  const pdb =
    "ATOM      1  CA  ALA A   1       0.000   0.000   0.000  1.00 20.00           C  \nATOM      2  N   ALA A   1       1.300   0.000   0.000  1.00 20.00           N  \nEND\n";
  const { model, scene, viewer, emit } = fixture(pdb, "pdb"),
    before = source(model.selectedAtoms({}));
  let complete!: () => void;
  vi.mocked(viewer.addSurface).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }) as never,
  );
  const paint = scene.configure({ mode: "surface" });
  await vi.waitFor(() => expect(viewer.addSurface).toHaveBeenCalledOnce());
  expect(
    emit.mock.calls.filter(([type, summary]) => type === "surface" && summary),
  ).toHaveLength(0);
  const surface = vi.mocked(viewer.addSurface).mock.calls[0];
  expect(surface[1]?.color).toBeUndefined();
  expect(surface[2]).toEqual({ model: 0, index: [0, 1] });
  complete();
  await paint;
  expect(emit).toHaveBeenCalledWith("surface", {
    total: 2,
    input: 0,
    estimated: 2,
    missing: 0,
  });
  expect(source(model.selectedAtoms({}))).toEqual(before);
  emit.mockClear();
  vi.mocked(viewer.addSurface).mockClear();
  await scene.configure({ mode: "cartoon" });
  expect(viewer.removeAllSurfaces).toHaveBeenCalled();
  expect(viewer.addSurface).not.toHaveBeenCalled();
  expect(emit).toHaveBeenCalledWith("surface", null);
});
it("resetting the source while a surface is generating cannot publish stale coverage", async () => {
  const { scene, viewer, emit } = fixture();
  let complete!: () => void;
  vi.mocked(viewer.addSurface).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }) as never,
  );
  const paint = scene.configure({ mode: "surface" });
  await vi.waitFor(() => expect(viewer.addSurface).toHaveBeenCalledOnce());
  scene.resetState();
  emit.mockClear();
  complete();
  await paint;
  expect(
    emit.mock.calls.filter(([type, summary]) => type === "surface" && summary),
  ).toHaveLength(0);
});

it("an aligned receptor and source pose colors only the receptor, while true comparisons retain their own colors", async () => {
  const pdb =
    "ATOM      1  CA  ALA A   1       0.000   0.000   0.000  1.00 20.00           C  \nATOM      2  N   ALA A   1       1.300   0.000   0.000  1.00 20.00           N  \nEND\n";
  const { model, viewer } = fixture(pdb, "pdb"),
    pose = new GLModel(1),
    emit = vi.fn();
  pose.addMolData(sdf, "sdf");
  const models = [model, pose];
  viewer.getModel = ((index: number) => models[index]) as GLViewer["getModel"];
  viewer.selectedAtoms = ((selection: AtomSelectionSpec) =>
    models[Number(selection.model ?? 0)].selectedAtoms(
      selection,
    )) as GLViewer["selectedAtoms"];
  const scene = new MolecularScene(viewer, emit);
  scene.inspect(true, false, ["pdb", "sdf"], 1);
  await scene.configure({ mode: "surface" });
  expect(viewer.addSurface).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    { model: 0, index: [0, 1] },
  );
  expect(emit).toHaveBeenCalledWith("surface", {
    total: 2,
    input: 0,
    estimated: 2,
    missing: 0,
  });
  expectSticks(pose.selectedAtoms({}));
  vi.mocked(viewer.addSurface).mockClear();
  emit.mockClear();
  scene.inspect(true, false, ["pdb", "sdf"], null);
  await scene.configure({ mode: "surface" });
  expect(viewer.addSurface).not.toHaveBeenCalled();
  expect(
    emit.mock.calls.filter(([type, summary]) => type === "surface" && summary),
  ).toHaveLength(0);
});
