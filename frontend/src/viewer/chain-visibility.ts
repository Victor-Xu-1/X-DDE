import type { AtomSpec } from "3dmol";

export type ChainDisplay =
  | { action: "show" | "hide" | "only"; chain: string }
  | { action: "all" }
  | { action: "subset"; chains: readonly string[] };

export function isChainSubset(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 8 &&
    value.every((chain) => typeof chain === "string" && chain.length <= 32) &&
    new Set(value).size === value.length
  );
}

/** Display indices only: never rewrite a chain ID, atom or coordinate. */
export function chainDisplay(
  input: unknown,
  chains: string[],
  atoms: AtomSpec[],
  hidden: ReadonlySet<number>,
): Set<number> {
  if (!input || typeof input !== "object")
    throw new Error("Invalid chain display");
  const display = input as ChainDisplay;
  const { action } = display;
  if (action === "all") return new Set();
  if (action === "subset") {
    if (
      !isChainSubset(display.chains) ||
      display.chains.some((id) => !chains.includes(id))
    )
      throw new Error("Unknown chain display selection");
    const visible = new Set(display.chains);
    return new Set(
      atoms
        .filter(
          (atom) =>
            Number.isInteger(atom.index) && !visible.has(atom.chain ?? ""),
        )
        .map((atom) => atom.index!),
    );
  }
  const { chain } = display;
  if (
    !["show", "hide", "only"].includes(action) ||
    typeof chain !== "string" ||
    !chains.includes(chain)
  )
    throw new Error("Unknown chain display selection");
  const next = new Set(hidden);
  for (const atom of atoms) {
    if (!Number.isInteger(atom.index)) continue;
    if (action === "only") {
      if ((atom.chain ?? "") === chain) next.delete(atom.index!);
      else next.add(atom.index!);
    } else if ((atom.chain ?? "") === chain) {
      if (action === "show") next.delete(atom.index!);
      else next.add(atom.index!);
    }
  }
  return next;
}

export function hiddenChainIds(atoms: AtomSpec[], hidden: ReadonlySet<number>) {
  const groups = new Map<string, number[]>();
  for (const atom of atoms) {
    if (!Number.isInteger(atom.index)) continue;
    const chain = atom.chain ?? "";
    const indices = groups.get(chain) ?? [];
    indices.push(atom.index!);
    groups.set(chain, indices);
  }
  return [...groups]
    .filter(([, indices]) => indices.every((i) => hidden.has(i)))
    .map(([chain]) => chain);
}
