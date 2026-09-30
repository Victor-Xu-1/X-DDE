import { paintBase } from "./style";
import {
  residueRef as ref,
  residueSelection as sel,
  atomPosition as position,
  scientificSelectionIdentity,
} from "./geometry";
import * as mol from "3dmol";
import {
  defaultOptions,
  residueLabel,
  type Residue,
  type SceneInfo,
  type ViewerOptions,
} from "./protocol";
const water = new Set(["HOH", "WAT"]);
const nucleic = new Set([
  "A",
  "C",
  "G",
  "U",
  "DA",
  "DC",
  "DG",
  "DT",
  "N",
  "DN",
]);
type Emit = (type: string, detail?: unknown) => void;
export class MolecularScene {
  options: ViewerOptions = { ...defaultOptions };
  info: SceneInfo = {
    atoms: 0,
    chains: [],
    ligands: [],
    residues: [],
    hasPolymer: false,
  };
  private selected: number[] = [];
  private hidden = new Set<number>();
  private edits = new Map<
    string,
    { indices: number[]; style: mol.AtomStyleSpec }
  >();
  private measurement: mol.AtomSpec[] = [];
  private overlay = false;
  private painting = Promise.resolve();
  private revision = 0;
  constructor(
    private viewer: mol.GLViewer,
    private emit: Emit,
  ) {}
  resetState() {
    this.revision++;
    this.selected = [];
    this.hidden.clear();
    this.edits.clear();
    this.measurement = [];
    this.options = { ...defaultOptions };
    this.emit("selected", null);
    this.emit("distance", null);
  }
  inspect(overlay: boolean) {
    this.resetState();
    this.overlay = overlay;
    const atoms = this.viewer.selectedAtoms({ model: 0 });
    const groups = new Map<
      string,
      { residue: Residue; atoms: mol.AtomSpec[] }
    >();
    for (const atom of atoms) {
      const residue = ref(atom),
        group = groups.get(residue.key) ?? { residue, atoms: [] };
      group.atoms.push(atom);
      groups.set(residue.key, group);
    }
    const ligands: Residue[] = [],
      residues: Residue[] = [];
    for (const { residue, atoms: group } of groups.values()) {
      if (water.has(residue.resn)) continue;
      if (group.some((a) => !a.hetflag) || nucleic.has(residue.resn))
        residues.push(residue);
      else if (group.filter((a) => a.elem !== "H").length > 1)
        ligands.push(residue);
    }
    this.info = {
      atoms: atoms.length,
      chains: [...new Set(atoms.map((a) => a.chain ?? ""))],
      ligands,
      residues,
      hasPolymer: residues.length > 0,
    };
    this.options.ligand = ligands[0]?.key ?? "";
    this.options.mode =
      ligands.length && residues.length ? "pocket" : "cartoon";
    this.viewer.setClickable({}, !overlay, (atom: mol.AtomSpec) => {
      void this.pick(atom);
    });
    return this.info;
  }
  async configure(value: Partial<ViewerOptions>) {
    if (value.mode && ["cartoon", "pocket", "surface"].includes(value.mode))
      this.options.mode = value.mode;
    if (value.radius && [3, 4, 5, 6, 8].includes(value.radius))
      this.options.radius = value.radius;
    if (typeof value.labels === "boolean") this.options.labels = value.labels;
    if (value.ligand && this.info.ligands.some((r) => r.key === value.ligand))
      this.options.ligand = value.ligand;
    if (value.pick && ["residue", "atom", "distance"].includes(value.pick)) {
      this.options.pick = value.pick;
      this.measurement = [];
      this.emit("distance", null);
    }
    await this.paint();
    if (value.mode === "pocket" || value.ligand) this.focusLigand();
  }
  paint(): Promise<void> {
    const revision = this.revision;
    // Surface generation is asynchronous. Serialize style updates to avoid stale layers.
    const next = this.painting
      .catch(() => undefined)
      .then(async () => {
        if (revision === this.revision) await this.draw();
      });
    this.painting = next;
    return next;
  }
  private async draw() {
    const v = this.viewer;
    v.removeAllSurfaces();
    v.removeAllLabels();
    v.removeAllShapes();
    if (this.overlay) {
      v.render();
      return;
    }
    await paintBase(v, this.info, this.options, [...this.hidden]);
    for (const edit of this.edits.values())
      v.setStyle({ index: edit.indices }, edit.style);
    if (this.selected.length)
      v.addStyle(
        { index: this.selected },
        { sphere: { scale: 0.3, color: "#ffae43", opacity: 0.75 } },
      );
    if (this.hidden.size) {
      v.setStyle({ index: [...this.hidden] }, {});
      v.setClickable({ index: [...this.hidden] }, false, null);
    }
    if (this.measurement.length === 2) {
      const [a, b] = this.measurement.map(position),
        distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      v.addLine({ start: a, end: b, color: "#b7891e", dashed: true });
      v.addLabel(`${distance.toFixed(2)} Å`, {
        position: {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          z: (a.z + b.z) / 2,
        },
        fontSize: 13,
        fontColor: "#805511",
        showBackground: false,
      });
    }
    v.render();
  }
  private async pick(atom: mol.AtomSpec) {
    if (this.overlay) return;
    const atoms =
      this.options.pick === "residue"
        ? this.viewer.selectedAtoms(sel(ref(atom)))
        : [atom];
    this.selected = atoms
      .map((a) => a.index!)
      .filter((n) => Number.isInteger(n));
    this.emit("selected", {
      pick_mode: this.options.pick,
      chain: atom.chain ?? "",
      residue: `${atom.resn}${atom.resi}${atom.icode ?? ""}`,
      atom: atom.atom ?? "",
      element: atom.elem ?? "",
      count: this.selected.length,
      identity: {
        ...scientificSelectionIdentity(atom),
        is_ligand: this.info.ligands.some((r) => r.key === ref(atom).key),
      },
      source_atom_index: atom.serial,
    });
    if (this.options.pick === "distance") {
      if (this.measurement.length === 2) this.measurement = [];
      this.measurement.push(atom);
      const points = this.measurement.map(position);
      this.emit(
        "distance",
        points.length === 2
          ? Math.hypot(
              points[0].x - points[1].x,
              points[0].y - points[1].y,
              points[0].z - points[1].z,
            )
          : null,
      );
    }
    try {
      await this.paint();
    } catch {
      this.emit("error", "Could not update structure display.");
    }
  }
  async selectResidue(key: string) {
    const residue = [...this.info.residues, ...this.info.ligands].find(
      (r) => r.key === key || residueLabel(r) === key,
    );
    if (!residue) return;
    const atoms = this.viewer.selectedAtoms(sel(residue));
    if (atoms.length) {
      await this.pick(atoms[0]);
      this.viewer.zoomTo(sel(residue));
      this.viewer.zoom(1.5);
      this.viewer.render();
    }
  }
  focusLigand() {
    const ligand = this.info.ligands.find((r) => r.key === this.options.ligand);
    if (ligand) {
      this.viewer.zoomTo(sel(ligand));
      this.viewer.zoom(1.25);
      this.viewer.render();
    }
  }
  async action(action: string) {
    if (this.overlay) return;
    if (action === "restore") {
      this.hidden.clear();
      this.edits.clear();
      this.selected = [];
      this.measurement = [];
      this.viewer.setClickable({}, true, (a: mol.AtomSpec) => {
        void this.pick(a);
      });
      this.emit("selected", null);
      this.emit("distance", null);
    } else if (action === "clear") {
      this.selected = [];
      this.measurement = [];
      this.emit("selected", null);
      this.emit("distance", null);
    } else if (action === "focus") {
      this.viewer.zoomTo({ index: this.selected });
      this.viewer.zoom(1.25);
    } else if (action === "hide") {
      for (const index of this.selected) this.hidden.add(index);
      this.selected = [];
      this.emit("selected", null);
    } else if (
      ["stick", "line", "sphere"].includes(action) &&
      this.selected.length
    ) {
      const styles: Record<string, mol.AtomStyleSpec> = {
        stick: { stick: { radius: 0.17, colorscheme: "Jmol" } },
        line: { line: { colorscheme: "Jmol" } },
        sphere: { sphere: { scale: 0.8, colorscheme: "Jmol" } },
      };
      this.edits.set(this.selected.join(","), {
        indices: [...this.selected],
        style: styles[action],
      });
    }
    await this.paint();
  }
}
