import { ligandBondRadius, ligandCarbonColor } from "../viewer/appearance";
import { molstarSticks } from "../viewer/molstar-sticks";
interface RepresentationParams {
  type: { name: string; params: Record<string, unknown> };
  colorTheme?: { name: string; params: Record<string, unknown> };
  sizeTheme?: { name: string; params: Record<string, unknown> };
  [key: string]: unknown;
}
interface MolstarCell {
  transform: { params?: RepresentationParams };
}
export interface AppearancePlugin {
  state: {
    data: {
      cells: Map<string, MolstarCell>;
      behaviors: { isUpdating: unknown };
      build(): {
        to(cell: MolstarCell): {
          update(params: RepresentationParams): unknown;
        };
        commit(): Promise<unknown>;
      };
    };
  };
}
export async function applyThinLigands(plugin: AppearancePlugin) {
  // Uniform size and aspect ratio 1 make atom caps equal to bond radii.
  // Bond junctions stay smooth and isolated ions remain visible.
  const update = plugin.state.data.build();
  const geometry = molstarSticks();
  let changed = false;
  for (const cell of plugin.state.data.cells.values()) {
    const original = cell.transform.params;
    if (original?.type?.name !== "ball-and-stick") continue;
    const params = original.type.params,
      visuals = params.visuals;
    if (
      params.sizeFactor === ligandBondRadius &&
      params.sizeAspectRatio === 1 &&
      params.adjustCylinderLength === false &&
      Array.isArray(visuals) &&
      visuals.length === 3 &&
      visuals.includes("element-sphere") &&
      visuals.includes("intra-bond") &&
      visuals.includes("inter-bond")
    )
      continue;
    update.to(cell).update({
      ...original,
      type: {
        name: "ball-and-stick",
        params: {
          ...params,
          ...geometry.typeParams,
        },
      },
      sizeTheme: { name: geometry.size, params: geometry.sizeParams },
      colorTheme: {
        name: "element-symbol",
        params: {
          carbonColor: {
            name: "uniform",
            params: { value: ligandCarbonColor },
          },
          lightness: 0,
          saturation: 0,
        },
      },
    });
    changed = true;
  }
  if (changed) await update.commit();
}
