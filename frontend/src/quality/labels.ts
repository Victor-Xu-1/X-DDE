export const checkLabels: Record<string, [string, string]> = {
  mol_pred_loaded: ["分子可读取", "Molecule can be read"],
  mol_true_loaded: ["参考姿势可读取", "Reference can be read"],
  mol_cond_loaded: ["受体可读取", "Receptor can be read"],
  sanitization: ["化学结构有效", "Chemical validity"],
  inchi_convertible: ["可转换为 InChI", "InChI conversion"],
  all_atoms_connected: ["分子为连续结构", "Connected molecular structure"],
  no_radicals: ["无自由基", "No radicals"],
  molecular_formula: ["与参考分子式一致", "Reference molecular formula"],
  molecular_bonds: ["与参考化学键一致", "Reference molecular bonds"],
  double_bond_stereochemistry: [
    "与参考双键立体一致",
    "Reference double-bond stereochemistry",
  ],
  tetrahedral_chirality: ["与参考手性一致", "Reference tetrahedral chirality"],
  bond_lengths: ["键长合理", "Bond lengths"],
  bond_angles: ["键角合理", "Bond angles"],
  internal_steric_clash: ["无明显内部碰撞", "Internal steric clashes"],
  aromatic_ring_flatness: ["芳香环平面合理", "Aromatic ring flatness"],
  "non-aromatic_ring_non-flatness": [
    "非芳香环构象合理",
    "Non-aromatic ring non-flatness",
  ],
  double_bond_flatness: ["双键周围平面合理", "Double-bond flatness"],
  internal_energy: ["内部能量检查", "Internal energy check"],
  "protein-ligand_maximum_distance": [
    "与受体距离合理",
    "Distance from receptor",
  ],
  minimum_distance_to_protein: [
    "与蛋白无明显距离冲突",
    "Protein distance clash",
  ],
  minimum_distance_to_organic_cofactors: [
    "与有机辅因子无明显距离冲突",
    "Organic-cofactor distance clash",
  ],
  minimum_distance_to_inorganic_cofactors: [
    "与无机辅因子无明显距离冲突",
    "Inorganic-cofactor distance clash",
  ],
  minimum_distance_to_waters: [
    "与结构水无明显距离冲突",
    "Water distance clash",
  ],
  volume_overlap_with_protein: [
    "与蛋白无明显体积重叠",
    "Protein volume overlap",
  ],
  volume_overlap_with_organic_cofactors: [
    "与有机辅因子无明显体积重叠",
    "Organic-cofactor volume overlap",
  ],
  volume_overlap_with_inorganic_cofactors: [
    "与无机辅因子无明显体积重叠",
    "Inorganic-cofactor volume overlap",
  ],
  volume_overlap_with_waters: [
    "与结构水无明显体积重叠",
    "Water volume overlap",
  ],
  "rmsd_≤_2å": ["与参考姿势偏差 ≤ 2 Å", "Reference RMSD ≤ 2 Å"],
};
