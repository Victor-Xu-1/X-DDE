import { afterAll, expect, it, vi } from "vitest";
const worker = vi.hoisted(() =>
  vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:comparison-render-worker"),
);
afterAll(() => worker.mockRestore());
import {
  GLModel,
  type GLViewer,
  type AtomSelectionSpec,
  type AtomStyleSpec,
} from "3dmol";
import { MolecularScene } from "../viewer/scene";
import { retainModifiedPolymer } from "../viewer/modified-polymer";
import { scientificSelectionIdentity } from "../viewer/geometry";
import { modelResidueRegion } from "../viewer/residue-region";
import { comparisonResidues, matchedResidue } from "./AlignedStructurePair";
import type { Displacement } from "./types";

it("links an author-numbered residue with its exact insertion code in either panel", () => {
  const reference = { chain: "A", number: 33, insertion_code: "B" };
  const moving = { chain: "B", number: 38, insertion_code: "" };
  const row = {
    role: "target",
    reference,
    moving,
    reference_letter: "A",
    moving_letter: "A",
    displacement_angstrom: 1.234,
    reference_position: [0, 0, 0],
    moving_source_position: [0, 0, 0],
    moving_aligned_position: [0, 0, 0],
  } satisfies Displacement;
  const atom = {
    chain: "A",
    residue: "ALA33B",
    atom: "CA",
    element: "C",
    count: 1,
  };
  const wrong = { ...row, reference: { ...reference, insertion_code: "" } };
  const rows = [wrong, row];
  expect(
    matchedResidue(rows, "reference", {
      ...atom,
      identity: { ...reference, alternate_location: "" },
    }),
  ).toBe(row);
  expect(
    matchedResidue([row], "moving", {
      ...atom,
      identity: { ...moving, alternate_location: "" },
    }),
  ).toBe(row);
  expect(
    matchedResidue(rows, "reference", {
      ...atom,
      identity: { ...reference, alternate_location: "", is_ligand: true },
    }),
  ).toBeUndefined();
  expect(comparisonResidues(row, ["moving"])).toEqual([
    { ...moving, model: 0, alternate_location: "" },
  ]);
});

it("keeps author residue A:33 and A:33B distinct after real CIF rendering parses them", async () => {
  const source = `data_insertions
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.auth_atom_id
_atom_site.auth_comp_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
ATOM 1 C CA ALA A 33 ? 1.000 2.000 3.000
ATOM 2 C CA ALA A 33 B 4.800 2.000 3.000
#`;
  const model = new GLModel(0);
  model.addMolData(source, "cif");
  const atoms = model.selectedAtoms({});
  const coordinates = atoms.map((atom) => [atom.x, atom.y, atom.z]);
  await retainModifiedPolymer(model, source, "cif", true);
  expect(
    atoms.map((atom) => scientificSelectionIdentity(atom).insertion_code),
  ).toEqual(["", "B"]);
  expect(atoms.map((atom) => [atom.x, atom.y, atom.z])).toEqual(coordinates);
  for (const [index, insertion_code] of ["", "B"].entries()) {
    expect(
      modelResidueRegion(
        [
          {
            model: 0,
            chain: "A",
            number: 33,
            insertion_code,
            alternate_location: "",
          },
        ],
        [{ model: 0, atoms }],
      ),
    ).toEqual({
      selections: [{ model: 0, indices: [index] }],
      requested: 1,
      matched: 1,
    });
  }
});

it("selects both native overlay models without merging local indices or inventing contacts", async () => {
  const models = [0, 1].map((index) => {
    const model = new GLModel(index);
    model.addMolData(
      "ATOM      1  CA  ASN A  33       1.000   2.000   3.000  1.00 50.00           C  \nEND\n",
      "pdb",
    );
    return model;
  });
  const originals = models.map((m) =>
    m.selectedAtoms({}).map((a) => [a.x, a.y, a.z, a.chain, a.resi]),
  );
  const selectedAtoms = (selection: AtomSelectionSpec = {}) => {
    const local = { ...selection };
    delete local.model;
    return models.flatMap((model, index) =>
      selection.model === undefined ||
      selection.model === index ||
      (Array.isArray(selection.model) &&
        selection.model.some((value) => value === index))
        ? model.selectedAtoms(local)
        : [],
    );
  };
  const addStyle = vi.fn(
    (selection: AtomSelectionSpec, style: AtomStyleSpec) => {
      const local = { ...selection };
      delete local.model;
      models[selection.model as number].setStyle(local, style, true);
    },
  );
  const contacts = vi.fn(),
    focus = vi.fn(),
    events = vi.fn();
  const viewer = {
    selectedAtoms,
    getModel: (index: number) => models[index],
    addStyle,
    setClickable: vi.fn(),
    removeAllLabels: vi.fn(),
    removeAllShapes: vi.fn(),
    removeAllSurfaces: vi.fn(),
    addLabel: vi.fn(),
    addLine: contacts,
    render: vi.fn(),
    zoomTo: focus,
    zoom: vi.fn(),
  } as unknown as GLViewer;
  const scene = new MolecularScene(viewer, events);
  scene.inspect(true, false, ["pdb", "pdb"]);
  const base = {
    chain: "A",
    number: 33,
    insertion_code: "",
    alternate_location: "",
  };
  await scene.highlightResidues([
    { ...base, model: 0 },
    { ...base, model: 1 },
  ]);
  expect(events).toHaveBeenCalledWith("site-region", {
    requested: 2,
    matched: 2,
  });
  expect(addStyle).toHaveBeenCalledWith(
    { model: 0, index: [0] },
    expect.any(Object),
  );
  expect(addStyle).toHaveBeenCalledWith(
    { model: 1, index: [0] },
    expect.any(Object),
  );
  scene.focusSite();
  expect(focus).toHaveBeenCalledWith(
    expect.objectContaining({ model: [0, 1] }),
  );
  expect(contacts).not.toHaveBeenCalled();
  expect(
    models.map((m) =>
      m.selectedAtoms({}).map((a) => [a.x, a.y, a.z, a.chain, a.resi]),
    ),
  ).toEqual(originals);
});
