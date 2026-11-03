import type { GLViewer } from "3dmol";
import { thinSticks } from "./appearance";
import { residueRef } from "./geometry";
import type { SceneInfo, ViewerOptions } from "./protocol";

export const chainPalette = ["#9772d6", "#45bdb3", "#e7af68", "#6fa2da"];

/** Add detail to existing cartoons; never replace the backbone or modify native atoms. */
export function paintPolymerDetail(
  viewer: GLViewer,
  info: SceneInfo,
  options: ViewerOptions,
  selected: number[],
) {
  if (!options.allAtoms && !options.sideChains && !selected.length) return;
  const polymers = new Set(info.residues.map((row) => row.key));
  const near =
    options.allAtoms || options.sideChains
      ? viewer.selectedAtoms({ model: 0 })
      : viewer.selectedAtoms({
          model: 0,
          within: { distance: 5, sel: { model: 0, index: selected } },
          byres: true,
        });
  const atoms = near.filter((atom) => polymers.has(residueRef(atom).key));
  for (const [i, chain] of info.chains.entries()) {
    const indices = atoms
      .filter(
        (atom) =>
          (atom.chain ?? "") === chain &&
          (options.allAtoms ||
            !["N", "C", "O", "OXT"].includes(atom.atom ?? "")),
      )
      .map((atom) => atom.index!);
    if (indices.length)
      viewer.addStyle(
        { model: 0, index: indices },
        {
          stick: {
            ...thinSticks().stick,
            colorscheme: {
              prop: "elem",
              map: {
                C: chainPalette[i % chainPalette.length],
                N: "#3059d9",
                O: "#e84b46",
                S: "#d6bd39",
                P: "#db963b",
                H: "#eeeeee",
              },
            },
          },
        },
      );
  }
}
