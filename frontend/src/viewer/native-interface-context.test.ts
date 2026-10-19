import { afterAll, expect, it, vi } from "vitest";
const worker = vi.hoisted(() =>
  vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:interface-render-worker"),
);
afterAll(() => worker.mockRestore());
import {
  GLModel,
  type GLViewer,
  type AtomSelectionSpec,
  type AtomStyleSpec,
} from "3dmol";
import { MolecularScene } from "./scene";
import { nativeInteractions } from "./scientific-data";

const contact = {
  kind: "hydrogen_bond",
  chain: "A",
  number: 33,
  residue: "ASN",
  protein_position: [1, 2, 3] as [number, number, number],
  ligand_position: [4, 2, 3] as [number, number, number],
  distance: 3,
};

function proteinInterface() {
  const model = new GLModel(0);
  model.addMolData(
    "ATOM      1  CA  ASN A  33       1.000   2.000   3.000  1.00 50.00           C  \nATOM      2  CA  ARG B 562       4.000   2.000   3.000  1.00 50.00           C  \nEND\n",
    "pdb",
  );
  const lines = vi.fn();
  const viewer = {
    selectedAtoms: model.selectedAtoms.bind(model),
    setStyle: model.setStyle.bind(model),
    addStyle: (selection: AtomSelectionSpec, style: AtomStyleSpec) =>
      model.setStyle(selection, style, true),
    setClickable: vi.fn(),
    removeAllSurfaces: vi.fn(),
    removeAllLabels: vi.fn(),
    removeAllShapes: vi.fn(),
    addLabel: vi.fn(),
    addLine: lines,
    addCylinder: vi.fn(),
    render: vi.fn(),
    zoomTo: vi.fn(),
    zoom: vi.fn(),
  } as unknown as GLViewer;
  const scene = new MolecularScene(viewer, vi.fn());
  scene.inspect(false, false, ["pdb"]);
  scene.options.labels = false;
  expect(scene.info.ligands).toHaveLength(0);
  expect(scene.info.hasInteractionContext).toBe(false);
  return { scene, model, lines };
}

it("draws verified native protein-interface contacts without requiring a free ligand", async () => {
  const { scene, model, lines } = proteinInterface();
  const before = model
    .selectedAtoms({})
    .map((a) => [a.x, a.y, a.z, a.resn, a.chain, a.resi]);
  scene.nativeInteractions = [contact];
  await scene.paint();
  expect(lines).toHaveBeenCalledTimes(1);
  expect(lines.mock.calls[0][0]).toMatchObject({
    start: { x: 1, y: 2, z: 3 },
    end: { x: 4, y: 2, z: 3 },
    dashed: true,
  });
  expect(
    model
      .selectedAtoms({})
      .map((a) => [a.x, a.y, a.z, a.resn, a.chain, a.resi]),
  ).toEqual(before);
  lines.mockClear();
  scene.options.interactions = false;
  await scene.paint();
  expect(lines).not.toHaveBeenCalled();
});

it("never invents geometric ligand contacts when native evidence is absent or explicitly empty", async () => {
  const { scene, lines } = proteinInterface();
  await scene.paint();
  expect(lines).not.toHaveBeenCalled();
  scene.nativeInteractions = [];
  await scene.paint();
  expect(lines).not.toHaveBeenCalled();
});

it("keeps the display bound aligned with the 10,000-contact native interface contract", () => {
  expect(nativeInteractions(Array(10000).fill(contact))).toHaveLength(10000);
  expect(() => nativeInteractions(Array(10001).fill(contact))).toThrow(
    "Invalid native interaction set",
  );
});
