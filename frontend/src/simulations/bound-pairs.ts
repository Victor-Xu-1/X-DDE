import {
  Structure,
  StructureElement,
  type Model,
} from "molstar/lib/mol-model/structure";
import { OrderedSet } from "molstar/lib/mol-data/int";
import {
  PluginStateObject as SO,
  PluginStateTransform,
} from "molstar/lib/mol-plugin-state/objects";
import { ParamDefinition as PD } from "molstar/lib/mol-util/param-definition";

/** One receptor with exactly one alternative ligand. Source models/coordinates stay intact. */
export function boundPair(protein: Structure, ligand: Structure): Structure {
  const builder = Structure.Builder({
    label: "Bound receptor and selected ligand",
  });
  for (const structure of [protein, ligand])
    for (const unit of structure.units)
      builder.addUnit(
        unit.kind,
        unit.model,
        unit.conformation.operator,
        unit.elements,
        unit.traits,
      );
  return builder.getStructure();
}
export function ligandLoci(
  pair: Structure,
  models: readonly Model[],
): StructureElement.Loci {
  const identities = new Set(models);
  return StructureElement.Loci(
    pair,
    pair.units
      .filter((unit) => identities.has(unit.model))
      .map((unit) => ({
        unit,
        indices: OrderedSet.ofBounds(
          0,
          unit.elements.length,
        ) as OrderedSet<StructureElement.UnitIndex>,
      })),
  );
}
export const NativeBoundPair = PluginStateTransform.BuiltIn({
  name: "x-dde-selected-bound-pair",
  display: { name: "Selected bound pair" },
  from: SO.Root,
  to: SO.Molecule.Structure,
  params: { structure: PD.Value<Structure | null>(null, { isHidden: true }) },
})({
  apply({ params }) {
    if (!params.structure)
      throw new Error("Exact receptor and ligand coordinates are required.");
    return new SO.Molecule.Structure(params.structure, {
      label: "Bound receptor and selected ligand",
    });
  },
});
