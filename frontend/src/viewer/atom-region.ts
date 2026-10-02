// Match native SDF serials explicitly; display indices are not source identities.
export function regionAtomIndices(
  value: unknown,
  atoms: { serial?: number; index?: number }[],
): number[] {
  if (
    !Array.isArray(value) ||
    value.length > 5000 ||
    new Set(value).size !== value.length ||
    value.some(
      (index) => !Number.isInteger(index) || index < 0 || index >= 5000,
    )
  )
    throw new Error("Invalid native atom region.");
  const bySerial = new Map(atoms.map((atom) => [atom.serial, atom.index]));
  return value.map((serial) => {
    const index = bySerial.get(serial);
    if (!Number.isInteger(index))
      throw new Error(
        "The region does not match the displayed source atom map.",
      );
    return index!;
  });
}
