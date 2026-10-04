import * as mol from "3dmol";
import { surfaceChargeRange, type SurfaceSummary } from "./protocol";

export const unknownChargeColor = 0xb1b7c1;
const gradient = new mol.Gradient.RWB(-surfaceChargeRange, surfaceChargeRange);
type Charge = { value: number; source: "input" | "estimated" };

/** Read partial charges only. Formal charge, element and confidence are not substitutes. */
export function partialCharge(
  atom: mol.AtomSpec,
  estimate: boolean,
  readInput = true,
): Charge | null {
  if (readInput) {
    for (const properties of [atom.properties, atom]) {
      if (properties && Object.hasOwn(properties, "partialCharge")) {
        const value: unknown = Reflect.get(properties, "partialCharge");
        return typeof value === "number" && Number.isFinite(value)
          ? { value, source: "input" }
          : null;
      }
    }
  }
  if (!estimate) return null;
  const key = `${atom.resn?.trim().toUpperCase()}:${atom.atom?.trim().toUpperCase()}`;
  const value = (mol.partialCharges as Record<string, number>)[key];
  return typeof value === "number" && Number.isFinite(value)
    ? { value, source: "estimated" }
    : null;
}

export function chargeColor(charge: Charge | null): number {
  return charge ? gradient.valueToHex(charge.value) : unknownChargeColor;
}

/** MOL2's zero-valued NO_CHARGES column is not a measured or calculated partial charge. */
export function inputChargesDeclared(text: string, format: string): boolean {
  if (format !== "mol2") return true;
  const header = text
    .split(/@<TRIPOS>MOLECULE\s*\r?\n/i)[1]
    ?.split(/\r?\n/)
    .slice(0, 4);
  const method = header?.[3]?.trim().toUpperCase();
  return !!method && method !== "NO_CHARGES";
}

/** The native surface builder calls getColorFromStyle on atom copies, accepting colorfunc.
 * No atom properties, coordinates or scientific charges are written by this display policy. */
export function electricalSurfaceStyle(
  atoms: mol.AtomSpec[],
  estimate: boolean,
  readInput = true,
) {
  const summary: SurfaceSummary = {
    total: atoms.length,
    input: 0,
    estimated: 0,
    missing: 0,
  };
  for (const atom of atoms) {
    const charge = partialCharge(atom, estimate, readInput);
    if (charge) summary[charge.source]++;
    else summary.missing++;
  }
  const style: mol.SurfaceStyleSpec & {
    colorfunc(atom: mol.AtomSpec): number;
  } = {
    opacity: 0.65,
    colorfunc: (atom) => chargeColor(partialCharge(atom, estimate, readInput)),
  };
  return { style, summary };
}
