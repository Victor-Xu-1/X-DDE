import { thinSticks, proteinBackbone } from "./appearance";
import { nativeLabelLayer } from "./native-labels";
import * as mol from "3dmol";
import { hideNonExchangeableHydrogens } from "./donor-hydrogens";
import { residueRef as ref, residueSelection as sel } from "./geometry";
import { residueLabel, type SceneInfo, type ViewerOptions } from "./protocol";
const palette = ["#9772d6", "#45bdb3", "#e7af68", "#6fa2da"];
const gray = {
  C: 0xa0a0a0,
  N: 0x6e6ae5,
  O: 0xeb5353,
  S: 0xcfbc3a,
  P: 0xe8a04b,
};

export function paintBase(
  v: mol.GLViewer,
  info: SceneInfo,
  options: ViewerOptions,
  hidden: number[],
) {
  const concise = info.hasInteractionContext && options.contactLimit !== "all";
  v.setStyle({}, thinSticks(info.hasPolymer ? "Jmol" : "greenCarbon"));
  for (const [i, chain] of (info.hasPolymer ? info.chains : []).entries()) {
    v.setStyle(
      { chain, hetflag: false },
      {
        ...proteinBackbone(palette[i % palette.length]),
        ...(concise
          ? {}
          : {
              line: { colorscheme: { prop: "elem", map: gray }, opacity: 0.2 },
            }),
      },
    );
  }
  for (const ligand of info.ligands) v.setStyle(sel(ligand), thinSticks());
  const isolated = v
    .selectedAtoms({})
    .filter((atom) => atom.bonds?.length === 0)
    .map((atom) => atom.index!);
  if (isolated.length)
    v.addStyle(
      { index: isolated },
      { sphere: { radius: 0.16, colorscheme: "Jmol" } },
    );
  v.setStyle({ or: [{ resn: "HOH" }, { resn: "WAT" }] }, {});
  const ligand = info.ligands.find((r) => r.key === options.ligand);
  if (ligand && options.mode === "pocket" && !concise) {
    const near = {
      hetflag: false,
      not: { index: hidden },
      within: { distance: options.radius, sel: sel(ligand) },
      byres: true,
    };
    v.addStyle(near, {
      line: {
        colorscheme: { prop: "elem", map: gray },
        opacity: 0.85,
        linewidth: 1.4,
      },
    });
    if (options.labels && !options.interactions) {
      const unique = new Map(
        v.selectedAtoms(near).map((atom) => [ref(atom).key, ref(atom)]),
      );
      for (const r of [...unique.values()].slice(0, 60))
        nativeLabelLayer(v).add(
          residueLabel(r),
          {
            fontSize: 12,
            fontColor: "#686b73",
            showBackground: false,
            inFront: false,
          },
          sel(r),
        );
    }
  }
}

export function paintOverlayModel(
  model: mol.GLModel,
  index: number,
  molecular = false,
  comparison = true,
) {
  model.setStyle(
    {},
    thinSticks(
      comparison
        ? ["blueCarbon", "orangeCarbon", "purpleCarbon"][index % 3]
        : "greenCarbon",
    ),
  );
  // Small-molecule parsers have no polymer residue names. Cartoon rendering must
  // never fabricate those identities or apply a polymer renderer to their atoms.
  const polymers = molecular
    ? []
    : model
        .selectedAtoms({ hetflag: false })
        .filter((atom) => typeof atom.resn === "string")
        .map((atom) => atom.index!);
  if (polymers.length)
    model.setStyle(
      { index: polymers },
      proteinBackbone(["#478dff", "#ffb266", "#aa84ef"][index]),
    );
  hideNonExchangeableHydrogens(model);
}
