/** Native sequence offsets are zero-based; the guided display uses sequence positions starting at 1. */
export function mutationDescription(value: unknown) {
  const fields = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? /^(\S+)\s+(\d+)\s+([A-Z])$/.exec(value)?.slice(1)
      : undefined;
  if (
    fields &&
    fields.length === 3 &&
    typeof fields[0] === "string" &&
    Number.isInteger(Number(fields[1])) &&
    Number(fields[1]) >= 0 &&
    /^[A-Z]$/.test(String(fields[2]))
  )
    return fields[0] + ":" + (Number(fields[1]) + 1) + " → " + fields[2];
  return typeof value === "string" ? value : "—";
}
