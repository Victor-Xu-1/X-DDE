import type { PluginContext } from "molstar/lib/mol-plugin/context";
import type { StateObjectSelector } from "molstar/lib/mol-state";
import type { PluginStateObject as SO } from "molstar/lib/mol-plugin-state/objects";
import { MolecularSurfaceRepresentationProvider } from "molstar/lib/mol-repr/structure/representation/molecular-surface";
import { setSubtreeVisibility } from "molstar/lib/mol-plugin/behavior/static/state";
import { ChargeTheme } from "./charge-theme";

/** Native geometry is created only for a requested surface, and removed when hidden. */
export class MolecularSurfaces {
  private polymers: StateObjectSelector<SO.Molecule.Structure>[] = [];
  private pending = new Map<string, Promise<string>>();

  constructor(private plugin: PluginContext) {}

  register(polymer: StateObjectSelector<SO.Molecule.Structure>) {
    if (!this.polymers.some((entry) => entry.ref === polymer.ref))
      this.polymers.push(polymer);
  }

  async ensure(signal: AbortSignal) {
    const refs: string[] = [];
    for (const polymer of this.polymers) {
      signal.throwIfAborted();
      let creating = this.pending.get(polymer.ref);
      if (!creating) {
        creating = this.plugin.builders.structure.representation
          .addRepresentation(polymer, {
            type: MolecularSurfaceRepresentationProvider,
            typeParams: { alpha: 0.45, ignoreHydrogens: true },
            color: ChargeTheme,
          })
          .then((representation) => {
            // A request may have been superseded while the native mesh was built.
            setSubtreeVisibility(
              this.plugin.state.data,
              representation.ref,
              true,
            );
            return representation.ref;
          });
        this.pending.set(polymer.ref, creating);
      }
      try {
        refs.push(await creating);
      } catch (error) {
        this.pending.delete(polymer.ref);
        throw error;
      }
      signal.throwIfAborted();
    }
    return refs;
  }

  async discard() {
    const refs = await Promise.all(this.pending.values());
    if (refs.length) {
      const update = this.plugin.build();
      refs.forEach((ref) => update.delete(ref));
      await update.commit();
      this.pending.clear();
    }
  }
}
