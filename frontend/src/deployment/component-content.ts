import type { ComponentPackage } from "./component-groups";

const scientificSummaries: Record<string, [string, string]> = {
  openmm: [
    "显式水模拟、三维轨迹、稳定性与接触分析",
    "Explicit-water dynamics, 3D trajectories, stability and contacts",
  ],
  gromacs: [
    "可切换的动力学引擎，保留原生轨迹与检查点",
    "Alternative dynamics engine with native trajectories and checkpoints",
  ],
  openfe: [
    "同系列小分子的变化网络、相对自由能与采样诊断",
    "Congeneric ligand networks, relative free energies and sampling diagnostics",
  ],
};

/** Scientific task scope is visible; installation resources remain available on hover. */
export function componentDescription(component: ComponentPackage, zh: boolean) {
  return (
    scientificSummaries[component.id]?.[zh ? 0 : 1] ??
    component.description.split(" / ")[zh ? 0 : 1] ??
    component.description
  );
}
