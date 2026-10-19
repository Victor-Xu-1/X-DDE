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
