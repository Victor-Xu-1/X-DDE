export const defaultPotentialRange = 5;
export function isPotentialRange(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 20
  );
}
