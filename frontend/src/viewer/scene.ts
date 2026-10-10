import {
  thinSticks,
  regionStyle,
  selectionStyle,
  focusedViewScale,
} from "./appearance";
import { paintBase, paintOverlayModel } from "./style";
import {
  nonExchangeableHydrogens,
  hideNonExchangeableHydrogens,
} from "./donor-hydrogens";
import { electricalSurfaceStyle } from "./charge-surface";
import { residueContacts, paintContacts } from "./contacts";
import { regionAtomIndices } from "./atom-region";
import { residueRegion } from "./residue-region";
import { focusDisplayContext } from "./context-focus";
import { nativeAnnotationStyle, nativeLabelLayer } from "./native-labels";
import { viewportFitFactor, type ViewportSize } from "./camera-resize";
import {
  residueRef as ref,
  residueSelection as sel,
  atomPosition as position,
  scientificSelectionIdentity,
  finiteCoordinates,
} from "./geometry";
import * as mol from "3dmol";
import { paintNativeContacts } from "./scientific-overlay";
import {
  attachmentGeometry,
  matchAttachmentAtoms,
  paintAttachments,
  type AttachmentGeometry,
} from "./attachment-geometry";
import type { NativeInteraction } from "../integrations/types";
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
import {
  paintChannel,
  focusChannel,
  type ChannelGeometry,
} from "./channel-geometry";
export class MolecularScene {
  channelGeometry?: ChannelGeometry;
  attachmentGeometry?: AttachmentGeometry;
  nativeInteractions?: NativeInteraction[];
  potential?: { data: mol.VolumeData; range: number };
  options: ViewerOptions = { ...defaultOptions };
  info: SceneInfo = {
    atoms: 0,
    chains: [],
    ligands: [],
    residues: [],
    hasPolymer: false,
  };
  private selected: number[] = [];
  private highlighted: number[] = [];
  private siteRegion: number[] = [];
  private hidden = new Set<number>();
  private attachmentCount = 0;
  private edits = new Map<
    string,
    { indices: number[]; style: mol.AtomStyleSpec }
  >();
  private measurement: mol.AtomSpec[] = [];
  private overlay = false;
  private formats: string[] = [];
  private inputCharges: boolean[] = [];
  private complexModel: number | null = null;
  private painting = Promise.resolve();
  private revision = 0;
  constructor(
    private viewer: mol.GLViewer,
    private emit: Emit,
    private viewport?: () => ViewportSize,
  ) {}
  resetState() {
    nativeLabelLayer(this.viewer).clear();
    this.nativeInteractions = undefined;
    this.channelGeometry = undefined;
    this.attachmentGeometry = undefined;
    this.attachmentCount = 0;
    this.potential = undefined;
    this.revision++;
    this.selected = [];
    this.highlighted = [];
    this.siteRegion = [];
    this.hidden.clear();
    this.edits.clear();
    this.measurement = [];
    this.options = { ...defaultOptions };
    this.emit("selected", null);
    this.emit("distance", null);
    this.emit("contacts", null);
    this.emit("surface", null);
  }
  inspect(
    overlay: boolean,
    molecular = false,
    formats: string[] = [],
    complexModel: number | null = null,
    inputCharges: boolean[] = [],
  ) {
    this.resetState();
    this.overlay = overlay;
    this.formats = formats;
    this.inputCharges = inputCharges;
    this.complexModel = complexModel;
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
      if (
        !molecular &&
        residue.resn &&
        (group.some((a) => !a.hetflag) || nucleic.has(residue.resn))
      )
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
      hasInteractionContext:
        residues.length > 0 &&
        (complexModel !== null || (!overlay && ligands.length > 0)),
    };
    this.options.ligand = ligands[0]?.key ?? "";
    this.options.pick = this.info.hasPolymer ? "residue" : "atom";
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
    if (typeof value.interactions === "boolean")
      this.options.interactions = value.interactions;
    if (
      value.contactLimit === 3 ||
      value.contactLimit === 5 ||
      value.contactLimit === "all"
    )
      this.options.contactLimit = value.contactLimit;
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
  async highlightAtoms(value: unknown) {
    if (this.overlay) return;
    this.highlighted = regionAtomIndices(
      value,
      this.viewer.selectedAtoms({ model: 0 }),
    );
    await this.paint();
  }
  async highlightResidues(value: unknown) {
    if (this.overlay) return;
    const region = residueRegion(
      value,
      this.viewer.selectedAtoms({ model: 0 }),
    );
    this.siteRegion = region.indices;
    await this.paint();
    // Selection highlights native residues without changing the researcher's camera.
    this.emit("site-region", {
      requested: region.requested,
      matched: region.matched,
    });
  }
  focusSite() {
    if (this.overlay || !this.siteRegion.length) return;
    focusDisplayContext(
      this.viewer,
      this.viewer.selectedAtoms({ model: 0, index: this.siteRegion }),
      null,
      this.viewport?.(),
    );
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
    nativeLabelLayer(v).clear();
    v.removeAllSurfaces();
    v.removeAllShapes();
    paintChannel(v, this.channelGeometry);
    const previousAttachments = this.attachmentCount;
    this.attachmentCount = this.overlay
      ? 0
      : paintAttachments(v, this.attachmentGeometry, this.hidden);
    if (this.attachmentGeometry !== undefined || previousAttachments)
      this.emit("attachments", this.attachmentCount);
    if (this.overlay) {
      for (const [index, format] of this.formats.entries())
        paintOverlayModel(
          v.getModel(index),
          index,
          ["sdf", "mol", "mol2"].includes(format),
          this.complexModel === null,
        );
      this.drawContacts();
      await this.paintSurface();
      // Residue contact highlights can restyle whole residues after base styling.
      for (const index of this.formats.keys())
        hideNonExchangeableHydrogens(v.getModel(index));
      v.render();
      return;
    }
    paintBase(v, this.info, this.options, [...this.hidden]);
    if (this.siteRegion.length) {
      v.addStyle({ model: 0, index: this.siteRegion }, regionStyle());
    }
    this.drawContacts();
    if (this.highlighted.length)
      v.setStyle({ index: this.highlighted }, regionStyle());
    for (const edit of this.edits.values())
      v.setStyle({ index: edit.indices }, edit.style);
    if (this.selected.length)
      v.addStyle({ index: this.selected }, selectionStyle());
    if (this.hidden.size) {
      v.setStyle({ index: [...this.hidden] }, {});
      v.setClickable({ index: [...this.hidden] }, false, null);
    }
    if (this.measurement.length === 2) {
      const [a, b] = this.measurement.map(position),
        distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      v.addLine({ start: a, end: b, color: "#b7891e", dashed: true });
      nativeLabelLayer(v).add(`${distance.toFixed(2)} Å`, {
        ...nativeAnnotationStyle,
        position: {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          z: (a.z + b.z) / 2,
        },
        fontSize: 13,
        fontColor: "#805511",
      });
    }
    await this.paintSurface();
    const hydrogenIndices = nonExchangeableHydrogens(
      v.selectedAtoms({ model: 0 }),
    );
    if (hydrogenIndices.length)
      v.setStyle({ model: 0, index: hydrogenIndices }, {});
    v.render();
  }
  async showAttachments(value: unknown) {
    if (this.overlay && value !== undefined)
      throw new Error("Attachment annotations need one native complex pose.");
    const checked = attachmentGeometry(value);
    matchAttachmentAtoms(this.viewer, checked);
    this.attachmentGeometry = checked;
    await this.paint();
  }
  private async paintSurface() {
    this.emit("surface", null);
    if (
      this.options.mode !== "surface" ||
      (this.overlay && !this.info.hasInteractionContext)
    )
      return;
    const residueKeys = new Set(this.info.residues.map((r) => r.key));
    const atoms = this.viewer
      .selectedAtoms({ model: 0 })
      .filter(
        (atom) =>
          !water.has(atom.resn ?? "") &&
          !this.hidden.has(atom.index!) &&
          (!this.info.hasPolymer || residueKeys.has(ref(atom).key)),
      );
    if (!atoms.length) return;
    const revision = this.revision;
    if (this.potential) {
      const { data, range } = this.potential;
      if (atoms.some((a) => data.getIndex(a.x!, a.y!, a.z!) < 0))
        throw new Error(
          "Potential grid does not cover the displayed structure",
        );
      await this.viewer.addSurface(
        mol.SurfaceType.SAS,
        {
          opacity: 0.82,
          voldata: data,
          volscheme: new mol.Gradient.RWB(-range, range),
        },
        { model: 0, index: atoms.map((a) => a.index!) },
      );
      return;
    }
    const { style, summary } = electricalSurfaceStyle(
      atoms,
      this.info.hasPolymer,
      this.inputCharges[0] ?? true,
    );
    await this.viewer.addSurface(mol.SurfaceType.VDW, style, {
      model: 0,
      index: atoms.map((atom) => atom.index!),
    });
    if (revision === this.revision) this.emit("surface", summary);
  }
  private drawContacts() {
    const ligand = this.info.ligands.find((r) => r.key === this.options.ligand);
    const ligandAtoms =
      this.complexModel === null
        ? ligand
          ? this.viewer.selectedAtoms({ model: 0, ...sel(ligand) })
          : []
        : this.viewer.selectedAtoms({ model: this.complexModel });
    nativeLabelLayer(this.viewer).protectLigand(
      ligandAtoms.filter((atom) => finiteCoordinates(atom)).map(position),
    );
    if (!this.options.interactions || !this.info.hasInteractionContext) {
      this.emit("contacts", null);
      return;
    }
    if (this.nativeInteractions !== undefined) {
      paintNativeContacts(
        this.viewer,
        this.nativeInteractions,
        this.options.contactLimit,
        this.options.labels,
      );
      this.emit("contacts", null);
      return;
    }
    const residueKeys = new Set(this.info.residues.map((r) => r.key));
    const protein = this.viewer
      .selectedAtoms({ model: 0 })
      .filter((a) => residueKeys.has(ref(a).key) && !this.hidden.has(a.index!));
    const contacts = residueContacts(
      protein,
      ligandAtoms.filter(
        (a) => this.complexModel !== null || !this.hidden.has(a.index!),
      ),
    );
    this.emit(
      "contacts",
      paintContacts(
        this.viewer,
        contacts,
        this.options.labels,
        0,
        this.options.contactLimit,
      ),
    );
  }
  private async pick(atom: mol.AtomSpec) {
    if (this.overlay) return;
    const coordinates = finiteCoordinates(atom);
    if (!coordinates) {
      this.emit("error", "Selected atom has no finite source coordinates");
      return;
    }
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
      position: coordinates,
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
    const atoms = this.viewer.selectedAtoms({ model: 0, ...sel(residue) });
    if (atoms.length) {
      await this.pick(atoms[0]);
      this.focusAtoms(atoms);
    }
  }
  private focusAtoms(anchors: mol.AtomSpec[]) {
    if (!anchors.length) return;
    const ligand =
      this.info.hasInteractionContext && this.complexModel === null
        ? this.info.ligands.find((row) => row.key === this.options.ligand)
        : null;
    focusDisplayContext(
      this.viewer,
      ligand
        ? [
            ...anchors,
            ...this.viewer.selectedAtoms({ model: 0, ...sel(ligand) }),
          ]
        : anchors,
      this.complexModel,
      this.viewport?.(),
    );
  }
  focusChannel() {
    if (this.channelGeometry) focusChannel(this.viewer, this.channelGeometry);
  }
  focusModel(index: number) {
    if (this.info.hasInteractionContext && this.complexModel === index) {
      focusDisplayContext(
        this.viewer,
        this.viewer.selectedAtoms({ model: index }),
        index,
        this.viewport?.(),
      );
      return;
    }
    this.viewer.zoomTo({ model: index });
    this.viewer.zoom(
      focusedViewScale *
        (this.viewport ? viewportFitFactor(this.viewport()) : 1),
    );
    this.viewer.render();
  }
  focusLigand() {
    const ligand = this.info.ligands.find((r) => r.key === this.options.ligand);
    const selection =
      this.complexModel !== null && this.info.hasInteractionContext
        ? { model: this.complexModel }
        : ligand
          ? { model: 0, ...sel(ligand) }
          : null;
    if (selection) {
      if (this.info.hasPolymer) {
        focusDisplayContext(
          this.viewer,
          this.viewer.selectedAtoms(selection),
          this.complexModel,
          this.viewport?.(),
        );
        return;
      }
      this.viewer.zoomTo(selection);
      this.viewer.zoom(
        focusedViewScale *
          (this.viewport ? viewportFitFactor(this.viewport()) : 1),
      );
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
      this.focusAtoms(
        this.viewer.selectedAtoms({ model: 0, index: this.selected }),
      );
    } else if (action === "hide") {
      for (const index of this.selected) this.hidden.add(index);
      this.selected = [];
      this.emit("selected", null);
    } else if (
      ["stick", "line", "sphere"].includes(action) &&
      this.selected.length
    ) {
      const styles: Record<string, mol.AtomStyleSpec> = {
        stick: thinSticks(this.info.hasPolymer ? "Jmol" : "greenCarbon"),
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
