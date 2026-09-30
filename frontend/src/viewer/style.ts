import * as mol from "3dmol";
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

export async function paintBase(
  v: mol.GLViewer,
  info: SceneInfo,
  options: ViewerOptions,
  hidden: number[],
) {
  v.setStyle(
    {},
    {
      sphere: { scale: 0.22, colorscheme: "Jmol" },
      stick: { radius: 0.14, colorscheme: "Jmol" },
    },
  );
  for (const [i, chain] of info.chains.entries()) {
    v.setStyle(
      { chain, hetflag: false },
      {
        cartoon: { color: palette[i % palette.length], opacity: 0.65 },
        line: { colorscheme: { prop: "elem", map: gray }, opacity: 0.2 },
      },
    );
  }
  for (const ligand of info.ligands)
    v.setStyle(sel(ligand), {
      stick: { radius: 0.17, colorscheme: "greenCarbon" },
      sphere: { scale: 0.24, colorscheme: "greenCarbon" },
    });
  v.setStyle({ or: [{ resn: "HOH" }, { resn: "WAT" }] }, {});
  const ligand = info.ligands.find((r) => r.key === options.ligand);
  if (ligand && options.mode === "pocket") {
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
    if (options.labels) {
      const unique = new Map(
        v.selectedAtoms(near).map((atom) => [ref(atom).key, ref(atom)]),
      );
      for (const r of [...unique.values()].slice(0, 60))
        v.addLabel(
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
  if (options.mode === "surface" && info.hasPolymer)
    await v.addSurface(
      mol.SurfaceType.VDW,
      { opacity: 0.35, color: "#bcb3dd" },
      { hetflag: false, not: { index: hidden } },
    );
}

export function paintOverlayModel(
  model: mol.GLModel,
  index: number,
  molecular = false,
) {
  model.setStyle(
    {},
    {
      stick: {
        radius: molecular ? 0.17 : 0.1,
        colorscheme: molecular
          ? "greenCarbon"
          : ["blueCarbon", "orangeCarbon", "purpleCarbon"][index],
      },
      ...(molecular
        ? { sphere: { scale: 0.24, colorscheme: "greenCarbon" } }
        : {}),
    },
  );
  // Small-molecule parsers have no polymer residue names. Cartoon rendering must
  // never fabricate those identities or apply a polymer renderer to their atoms.
  const polymers = model
    .selectedAtoms({ hetflag: false })
    .filter((atom) => typeof atom.resn === "string")
    .map((atom) => atom.index!);
  if (polymers.length)
    model.setStyle(
      { index: polymers },
      { cartoon: { color: ["#478dff", "#ffb266", "#aa84ef"][index] } },
    );
}
