import { expect, it, vi, afterAll } from "vitest";
const objectUrl = vi.hoisted(() =>
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:contact-parser"),
);
afterAll(() => objectUrl.mockRestore());
import {
  GLModel,
  type AtomSpec,
  type GLViewer,
  type AtomSelectionSpec,
  type AtomStyleSpec,
} from "3dmol";
import { residueContacts, paintContacts } from "./contacts";
import { MolecularScene } from "./scene";
const atom = (x: number, resi = 1, elem = "C", resn = "ASN"): AtomSpec => ({
  x,
  y: 0,
  z: 0,
  chain: "A",
  resn,
  resi,
  elem,
  index: resi,
  serial: resi,
});
it("keeps one nearest heavy-atom pair per exact residue, respecting cutoff, water and finite coordinates", () => {
  const protein = [
    atom(3, 1),
    atom(2, 1),
    atom(4, 2),
    atom(4.01, 3),
    atom(1, 4, "H"),
    atom(1, 5, "D"),
    atom(1, 6, "O", "HOH"),
    { ...atom(0, 7), z: NaN },
  ];
  const ligand = [{ ...atom(0), resn: "LIG" }];
  const before = structuredClone({ protein, ligand });
  const contacts = residueContacts(protein, ligand);
  expect(contacts.map((c) => [c.protein.resi, c.distance])).toEqual([
    [1, 2],
    [2, 4],
  ]);
  expect({ protein, ligand }).toEqual(before);
  expect(residueContacts(protein, [])).toEqual([]);
  expect(residueContacts(protein, [{ x: NaN }])).toEqual([]);
});
it("retains insertion codes and source atom identities, including real coordinate overlaps", () => {
  const protein = [
    { ...atom(2), icode: "A" },
    { ...atom(3), icode: "B" },
    atom(0, 2),
  ];
  const contacts = residueContacts(protein, [atom(0)]);
  expect(contacts).toHaveLength(3);
  expect(contacts[0].distance).toBe(0);
  expect(contacts[0].protein).toBe(protein[2]);
});
it("bounds the visual layer and labels actual distances without assigning chemical interaction types", () => {
  const viewer = {
    addStyle: vi.fn(),
    addCylinder: vi.fn(),
    addLabel: vi.fn(),
  } as unknown as GLViewer;
  const contacts = Array.from({ length: 20 }, (_, i) => ({
    protein: atom(2, i),
    ligand: atom(0),
    distance: 2,
  }));
  expect(paintContacts(viewer, contacts, true)).toEqual({
    cutoff: 4,
    total: 20,
    shown: 12,
  });
  expect(viewer.addLabel).toHaveBeenCalledTimes(12);
  expect(vi.mocked(viewer.addLabel).mock.calls[0][0]).toContain("2.00 Å");
  expect(
    vi
      .mocked(viewer.addCylinder)
      .mock.calls.every(([shape]) => shape!.radius === 0.035),
  ).toBe(true);
  vi.mocked(viewer.addLabel).mockClear();
  paintContacts(viewer, contacts, false);
  expect(viewer.addLabel).not.toHaveBeenCalled();
});
function fixture() {
  const protein = new GLModel(0),
    ligand = new GLModel(1);
  protein.addMolData(
    "ATOM      1  CA  ASN A 140       2.000   0.000   0.000  1.00 20.00           C  \nATOM      2  N   ASN A 140       3.300   0.000   0.000  1.00 20.00           N  \nEND\n",
    "pdb",
  );
  ligand.addMolData(
    "Contact source\n  RDKit          3D\n\n  2  1  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n   -1.2000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  2  0  0  0  0\nM  END\n$$$$\n",
    "sdf",
  );
  const models = [protein, ligand],
    cylinders: unknown[] = [];
  const select = (s: AtomSelectionSpec) =>
    models.flatMap((m, i) => {
      if (s.model !== undefined && s.model !== i) return [];
      const { model: _, ...rest } = s;
      return m.selectedAtoms(rest);
    });
  const apply = (s: AtomSelectionSpec, style: AtomStyleSpec, add = false) =>
    models.forEach((m, i) => {
      if (s.model === undefined || s.model === i) {
        const { model: _, ...rest } = s;
        m.setStyle(rest, style, add);
      }
    });
  const viewer = {
    selectedAtoms: select,
    getModel: (i: number) => models[i],
    setStyle: apply,
    addStyle: (s: AtomSelectionSpec, v: AtomStyleSpec) => apply(s, v, true),
    setClickable: vi.fn(),
    removeAllShapes: () => {
      cylinders.length = 0;
    },
    removeAllSurfaces: vi.fn(),
    removeAllLabels: vi.fn(),
    addCylinder: (shape: unknown) => cylinders.push(shape),
    addLabel: vi.fn(),
    render: vi.fn(),
  } as unknown as GLViewer;
  const emit = vi.fn(),
    scene = new MolecularScene(viewer, emit);
  expect(protein.selectedAtoms({})).toHaveLength(2);
  expect(ligand.selectedAtoms({})).toHaveLength(2);
  const source = () =>
    models.map((m) =>
      m
        .selectedAtoms({})
        .map((a) => ({
          x: a.x,
          y: a.y,
          z: a.z,
          index: a.index,
          serial: a.serial,
          bonds: a.bonds,
          orders: a.bondOrder,
        })),
    );
  return { scene, emit, cylinders, source, protein };
}
it("draws separate-model receptor-pose contacts by default and completely removes the layer when disabled", async () => {
  const { scene, emit, cylinders, source, protein } = fixture(),
    before = structuredClone(source());
  scene.inspect(true, false, ["pdb", "sdf"], 1);
  expect(scene.info.hasInteractionContext).toBe(true);
  await scene.paint();
  expect(cylinders.length).toBeGreaterThan(0);
  expect(emit).toHaveBeenCalledWith("contacts", {
    cutoff: 4,
    total: 1,
    shown: 1,
  });
  expect(protein.selectedAtoms({})[0].style?.stick).toBeDefined();
  await scene.configure({ interactions: false });
  expect(cylinders).toHaveLength(0);
  expect(protein.selectedAtoms({})[0].style?.stick).toBeUndefined();
  expect(source()).toEqual(before);
});
it("does not invent cross-model interactions in a true comparison", async () => {
  const { scene, cylinders, emit } = fixture();
  scene.inspect(true, false, ["pdb", "sdf"], null);
  await scene.paint();
  expect(scene.info.hasInteractionContext).toBe(false);
  expect(cylinders).toHaveLength(0);
  expect(emit).toHaveBeenCalledWith("contacts", null);
});
