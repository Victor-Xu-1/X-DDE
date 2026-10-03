import type { AtomStyleSpec } from "3dmol";

// One display policy for ligands, overlays and selection highlights.
export const ligandBondRadius = 0.09;
export const ligandCarbonColor = 0x00ff00;
export function thinSticks(
  colorscheme = "greenCarbon",
  color?: string,
): AtomStyleSpec {
  return {
    stick: {
      radius: ligandBondRadius,
      ...(color ? { color } : { colorscheme }),
    },
  };
}
export const regionStyle = () => thinSticks("greenCarbon", "#dc8e25");
export const selectionStyle = () => thinSticks("greenCarbon", "#ffae43");
