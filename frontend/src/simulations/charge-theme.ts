import { ColorTheme } from "molstar/lib/mol-theme/color";
import {
  StructureElement,
  StructureProperties,
  type Structure,
} from "molstar/lib/mol-model/structure";
import { Color } from "molstar/lib/mol-util/color";
import {
  partialCharge,
  chargeColor,
  unknownChargeColor,
} from "../viewer/charge-surface";
import type { SurfaceSummary } from "../viewer/protocol";

function estimate(location: StructureElement.Location) {
  return partialCharge(
    {
      resn: StructureProperties.atom.label_comp_id(location),
      atom: StructureProperties.atom.label_atom_id(location),
    },
    true,
    false,
  );
}
const factory: ColorTheme.Factory<{}, "group"> = (_context, props) => ({
  factory,
  props,
  granularity: "group",
  description:
    "Standard-residue partial-charge approximation; not PB/APBS potential.",
  color: (location) =>
    Color(
      StructureElement.Location.is(location)
        ? chargeColor(estimate(location))
        : unknownChargeColor,
    ),
});
export const ChargeTheme: ColorTheme.Provider<
  {},
  "xdde-partial-charge",
  "group"
> = {
  name: "xdde-partial-charge",
  label: "Partial-charge approximation",
  category: ColorTheme.Category.Atom,
  factory,
  getParams: () => ({}),
  defaultValues: {},
  isApplicable: (context) => !!context.structure,
};
export function chargeCoverage(structure: Structure): SurfaceSummary {
  const summary: SurfaceSummary = {
    total: 0,
    input: 0,
    estimated: 0,
    missing: 0,
  };
  const location = StructureElement.Location.create(structure);
  for (const unit of structure.units) {
    location.unit = unit;
    for (let i = 0; i < unit.elements.length; i++) {
      location.element = unit.elements[i];
      summary.total++;
      summary[estimate(location) ? "estimated" : "missing"]++;
    }
  }
  return summary;
}
