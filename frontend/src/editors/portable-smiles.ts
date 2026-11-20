type StructureExport = {
  getSmiles(isExtended?: boolean): Promise<string>;
  getMolfile(format: "v3000"): Promise<string>;
  structService: {
    getInChIKey(structure: string): Promise<string>;
  };
};

export class SmilesHandoffError extends Error {}

/** Indigo can return CXSMILES even from getSmiles(false). */
export function hasSmilesExtension(value: string) {
  return value.includes("|");
}

export async function readPortableSmiles(editor: StructureExport) {
  let smiles: string;
  let mol: string;
  try {
    smiles = (await editor.getSmiles(false)).trim();
    mol = await editor.getMolfile("v3000");
  } catch {
    throw new SmilesHandoffError(
      "无法生成可回读的单行 SMILES，请下载 MOL V3000。",
    );
  }
  // AND/OR stereo collections cannot be expressed as an absolute SMILES.
  if (hasSmilesExtension(smiles) || /MDLV30\/STER(?:AC|EL)\d*/.test(mol))
    throw new SmilesHandoffError(
      "此结构含扩展注释或相对手性，请下载 MOL V3000 保留完整结构。",
    );

  if (!/^[\x21-\x7e]+$/.test(smiles) || smiles.includes(">"))
    throw new SmilesHandoffError(
      "无法生成可回读的单行 SMILES，请下载 MOL V3000。",
    );

  try {
    const expected = await editor.structService.getInChIKey(mol);
    const exported = await editor.structService.getInChIKey(smiles);
    if (expected?.trim() && expected === exported) return smiles;
  } catch {
    // The MOL path remains available for structures without an InChI round trip.
  }
  throw new SmilesHandoffError(
    "无法核对 SMILES 的结构与立体化学，请下载 MOL V3000。",
  );
}
