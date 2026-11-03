import type { AtomSpec } from "3dmol";

export type ChainDisplay = {
  action: "show" | "hide" | "only" | "all";
  chain?: string;
};

/** Display indices only: never rewrite a chain ID, atom or coordinate. */
export function chainDisplay(
  input: unknown,
  chains: string[],
  atoms: AtomSpec[],
  hidden: ReadonlySet<number>,
): Set<number> {
  if (!input || typeof input !== "object")
    throw new Error("Invalid chain display");
  const { action, chain } = input as ChainDisplay;
  if (action === "all") return new Set();
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
