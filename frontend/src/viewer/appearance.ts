import type { AtomStyleSpec } from "3dmol";

// Shared display policy; styling never changes source coordinates or identities.
export const ligandBondRadius = 0.14;
export const focusedViewScale = 0.75;
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

export function proteinBackbone(
  color: string,
  representation: "ribbon" | "trace" = "ribbon",
): AtomStyleSpec {
  return {
    cartoon: {
      color,
      opacity: 1,
      ...(representation === "trace"
        ? { style: "trace", thickness: 0.12 }
        : {}),
    },
  };
}
