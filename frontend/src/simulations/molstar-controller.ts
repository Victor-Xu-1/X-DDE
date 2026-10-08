import { PluginContext } from "molstar/lib/mol-plugin/context";
import { DefaultPluginSpec } from "molstar/lib/mol-plugin/spec";
import { PluginConfig } from "molstar/lib/mol-plugin/config";
import { StateTransforms } from "molstar/lib/mol-plugin-state/transforms";
import { setSubtreeVisibility } from "molstar/lib/mol-plugin/behavior/static/state";
import { lociLabel } from "molstar/lib/mol-theme/label";
import { Loci } from "molstar/lib/mol-model/loci";
import { StructureFocusRepresentation } from "molstar/lib/mol-plugin/behavior/dynamic/selection/structure-focus-representation";
import { createStructureRepresentationParams } from "molstar/lib/mol-plugin-state/helpers/structure-representation-params";
import { StructureSelection } from "molstar/lib/mol-model/structure/query";
import { Script } from "molstar/lib/mol-script/script";
import { Color } from "molstar/lib/mol-util/color";
import type { StateObjectSelector } from "molstar/lib/mol-state";
import type { PluginStateObject as SO } from "molstar/lib/mol-plugin-state/objects";
import { readStructure } from "./trajectory-source";
import { sampledTrajectory, NativeTrajectory } from "./native-trajectory";
import { ChargeTheme, chargeCoverage } from "./charge-theme";
import { MolecularSurfaceRepresentationProvider } from "molstar/lib/mol-repr/structure/representation/molecular-surface";
import type { SurfaceSummary } from "../viewer/protocol";
import type { Residue } from "./types";
import type { FigureSettings } from "../publication/settings";
import { molecularFigure } from "./molstar-figure";
import { boundPair, ligandLoci, NativeBoundPair } from "./bound-pairs";

export interface StructureSource {
  url: string;
  format: "pdb" | "sdf";
  role: "protein" | "ligand";
  label?: string;
}
export interface MolecularView {
  protein: boolean;
  surface: boolean;
  contacts: boolean;
  ligand: "all" | "a" | "b";
}
export class MolecularController {
  private plugin = new PluginContext({
    ...DefaultPluginSpec(),
    config: [
      // Use the official viewer policy: software WebGL is valid when hardware
      // acceleration is unavailable. This never substitutes molecular data.
      [PluginConfig.General.AllowMajorPerformanceCaveat, true],
    ],
  });
  private model?: StateObjectSelector<SO.Molecule.Model>;
  private structures: StateObjectSelector<SO.Molecule.Structure>[] = [];
  private visibility: {
    ref: string;
    kind: "protein" | "surface" | "a" | "b";
  }[] = [];
  private trajectory = false;
  private frameCount = 1;
  private ligandStructure?: StateObjectSelector<SO.Molecule.Structure>;
  private queue = Promise.resolve();
  private requestedFrame = 0;
  private resizeObserver?: ResizeObserver;
  private viewport?: HTMLDivElement;
  surfaceSummary: SurfaceSummary | null = null;
  private boundContacts: ReturnType<typeof ligandLoci>[] = [];

  async initialize(
    canvas: HTMLCanvasElement,
    container: HTMLDivElement,
    onAtom?: (label: string) => void,
  ) {
    await this.plugin.init();
    this.viewport = container;
    this.plugin.representation.structure.themes.colorThemeRegistry.add(
      ChargeTheme,
    );
    if (!(await this.plugin.initViewerAsync(canvas, container)))
      throw new Error("WebGL is unavailable.");
    this.plugin.canvas3d?.setProps({
      renderer: { backgroundColor: Color(0xffffff) },
      camera: { manualReset: true },
    });
    this.resizeObserver = new ResizeObserver(() => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0)
        this.plugin.handleResize();
    });
    this.resizeObserver.observe(container);
    this.plugin.behaviors.interaction.hover.subscribe(({ current }) =>
      onAtom?.(
        Loci.isEmpty(current.loci)
          ? ""
          : lociLabel(current.loci, {
              htmlStyling: false,
              granularity: "element",
            }),
      ),
    );
    await this.plugin.state.updateBehavior(
      StructureFocusRepresentation,
      (params) => ({
        ...params,
        expandRadius: 4,
        components: ["surroundings", "interactions"],
        excludeTargetFromSurroundings: true,
        ignoreHydrogens: true,
        ignoreHydrogensVariant: "non-polar",
        surroundingsParams: createStructureRepresentationParams(
          this.plugin,
          undefined,
          {
            type: "ball-and-stick",
            typeParams: {
              sizeFactor: 0.12,
              visuals: ["intra-bond", "inter-bond"],
            },
            color: "element-symbol",
          },
        ),
      }),
    );
  }

  async load(
    sources: StructureSource[],
    frames: string[] | undefined,
    signal: AbortSignal,
    ligandContext = true,
  ) {
    const entries = frames
      ? [
          {
            nativeTrajectory: await sampledTrajectory(frames, signal),
            format: "pdb" as const,
            role: "protein" as const,
          },
        ]
      : await Promise.all(
          sources.map(async (source) => ({
            ...source,
            text: await readStructure(source.url, signal),
          })),
        );
    signal.throwIfAborted();
    let ligandIndex = 0;
    for (const entry of entries) {
      const trajectory =
        "nativeTrajectory" in entry
          ? await this.plugin
              .build()
              .toRoot()
              .apply(NativeTrajectory, { trajectory: entry.nativeTrajectory })
              .commit()
          : await this.plugin.builders.structure.parseTrajectory(
              await this.plugin.builders.data.rawData({ data: entry.text }),
              entry.format,
            );
      const model = await this.plugin.builders.structure.createModel(
        trajectory,
        { modelIndex: 0 },
      );
      if (frames) {
        this.model = model;
        this.trajectory = true;
        this.frameCount = frames.length;
      }
      const structure =
        await this.plugin.builders.structure.createStructure(model);
      this.structures.push(structure);
      if (entry.role === "protein") {
        const polymer =
          await this.plugin.builders.structure.tryCreateComponentStatic(
            structure,
            "polymer",
          );
        if (polymer) {
          const ribbon =
            await this.plugin.builders.structure.representation.addRepresentation(
              polymer,
              {
                type: "cartoon",
                color: "secondary-structure",
                colorParams: {
                  saturation: 0,
                  colors: {
                    name: "custom",
                    params: {
                      alphaHelix: Color(0xeb777a),
                      threeTenHelix: Color(0xd07ba4),
                      piHelix: Color(0xb781bb),
                      betaTurn: Color(0x719bc4),
                      betaStrand: Color(0xe8bd48),
                      coil: Color(0x8ea6bf),
                      bend: Color(0x8ea6bf),
                      turn: Color(0x8ea6bf),
                      dna: Color(0x8b87ca),
                      rna: Color(0xbb7bb8),
                      carbohydrate: Color(0xaca6ce),
                    },
                  },
                },
              },
            );
          const surface =
            await this.plugin.builders.structure.representation.addRepresentation(
              polymer,
              {
                type: MolecularSurfaceRepresentationProvider,
                typeParams: { alpha: 0.45, ignoreHydrogens: true },
                color: ChargeTheme,
              },
            );
          this.visibility.push(
            { ref: ribbon.ref, kind: "protein" },
            { ref: surface.ref, kind: "surface" },
          );
          this.surfaceSummary = polymer.obj
            ? chargeCoverage(polymer.obj.data)
            : null;
        }
      }
      const ligand = ligandContext
        ? await this.plugin.builders.structure.tryCreateComponentStatic(
            structure,
            entry.role === "ligand" ? "all" : "ligand",
          )
        : undefined;
      if (ligand) {
        const representation =
          await this.plugin.builders.structure.representation.addRepresentation(
            ligand,
            {
              type: "ball-and-stick",
              typeParams: {
                sizeFactor: 0.14,
                aspectRatio: 1,
                ignoreHydrogens: true,
                ignoreHydrogensVariant: "non-polar",
                visuals: ["intra-bond", "inter-bond"],
              },
              color: "element-symbol",
              colorParams: {
                carbonColor: {
                  name: "uniform",
                  params: { value: Color(ligandIndex ? 0x23b8d0 : 0x36bf65) },
                },
              },
            },
          );
        this.visibility.push({
          ref: representation.ref,
          kind: ligandIndex++ ? "b" : "a",
        });
        this.ligandStructure ??= ligand;
      }
      signal.throwIfAborted();
    }
    if (!frames && this.structures[0]?.obj) {
      for (const ligand of this.structures.slice(1)) {
        if (!ligand.obj) continue;
        const pair = boundPair(this.structures[0].obj.data, ligand.obj.data);
        await this.plugin
          .build()
          .toRoot()
          .apply(NativeBoundPair, { structure: pair })
          .commit();
        this.boundContacts.push(ligandLoci(pair, ligand.obj.data.models));
      }
    }
    if (this.ligandStructure) this.focusLigand();
    else this.reset();
  }

  setFrame(index: number, ready: () => void) {
    if (
      !this.trajectory ||
      !this.model ||
      index < 0 ||
      index >= this.frameCount
    )
      return Promise.resolve();
    const model = this.model;
    this.requestedFrame = index;
    this.queue = this.queue.then(async () => {
      if (this.requestedFrame !== index) return;
      await this.plugin
        .build()
        .to(model)
        .update(StateTransforms.Model.ModelFromTrajectory, () => ({
          modelIndex: index,
        }))
        .commit();
      ready();
    });
    return this.queue;
  }

  setView(view: MolecularView) {
    for (const item of this.visibility) {
      const visible =
        item.kind === "protein"
          ? view.protein
          : item.kind === "surface"
            ? view.surface
            : view.ligand === "all" || view.ligand === item.kind;
      setSubtreeVisibility(this.plugin.state.data, item.ref, !visible);
    }
    if (
      !view.contacts ||
      (!this.trajectory &&
        this.boundContacts.length > 1 &&
        view.ligand === "all")
    )
      this.plugin.managers.structure.focus.clear();
    else if (!this.trajectory && this.boundContacts.length) {
      this.plugin.managers.structure.focus.setFromLoci(
        this.boundContacts[view.ligand === "b" ? 1 : 0],
      );
    } else if (this.trajectory && this.ligandStructure?.obj) {
      const loci = StructureSelection.toLociWithSourceUnits(
        Script.getStructureSelection(
          (q) => q.struct.generator.all(),
          this.ligandStructure.obj.data,
        ),
      );
      this.plugin.managers.structure.focus.setFromLoci(loci);
    }
  }

  focusResidue(residue: Residue) {
    for (const structure of this.structures) {
      if (!structure.obj) continue;
      const selection = Script.getStructureSelection(
        (q) =>
          q.struct.generator.atomGroups({
            "chain-test": q.core.rel.eq([
              q.ammp("auth_asym_id"),
              residue.chain,
            ]),
            "residue-test": q.core.logic.and([
              q.core.rel.eq([q.ammp("auth_seq_id"), Number(residue.number)]),
              q.core.rel.eq([q.ammp("pdbx_PDB_ins_code"), residue.insertion]),
            ]),
          }),
        structure.obj.data,
      );
      const loci = StructureSelection.toLociWithSourceUnits(selection);
      if (Loci.isEmpty(loci)) continue;
      this.plugin.managers.interactivity.lociHighlights.highlightOnly({ loci });
      this.plugin.managers.camera.focusLoci(loci);
      return;
    }
  }

  reset() {
    this.plugin.managers.camera.reset(undefined, 0);
  }
  focusLigand() {
    if (this.ligandStructure?.obj)
      this.plugin.managers.camera.focusLoci(
        StructureSelection.toLociWithSourceUnits(
          Script.getStructureSelection(
            (q) => q.struct.generator.all(),
            this.ligandStructure.obj.data,
          ),
        ),
      );
  }
  figure(settings: FigureSettings): Promise<Blob> {
    const render = () => {
      if (!this.viewport) throw new Error("The molecular view is not ready.");
      return molecularFigure(this.plugin, this.viewport, settings);
    };
    const result = this.queue.then(render);
    // The caller receives the actual failure. Settling the queue keeps later frame selection usable.
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  dispose() {
    this.resizeObserver?.disconnect();
    this.plugin.dispose();
  }
}
