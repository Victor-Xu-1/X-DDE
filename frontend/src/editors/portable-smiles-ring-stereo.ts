// Track bond positions in Indigo's emitted SMILES. Chemistry and round-trip
// validation remain with the native reader.
type Bond = { from: number; to: number; offset: number; token: string };
type BondPosition = Pick<Bond, "offset" | "token">;

function bondPositions(text: string) {
  const tokens = /\[[^\[\]]+\]|Br|Cl|[BCNOPSFIbcnops*]|%\d{2}|[0-9().=#:/$\\-]/gy;
  const bonds: Bond[] = [];
  const branches: number[] = [];
  const rings = new Map<string, { atom: number; bond: BondPosition }>();
  const atoms: string[] = [];
  let current = -1;
  let pending: BondPosition | undefined;
  let cursor = 0;
  while (cursor < text.length) {
    const match = tokens.exec(text);
    if (!match) return null;
    const [token] = match;
    const offset = cursor;
    cursor = tokens.lastIndex;
    if (/^[=#:$/\\-]$/.test(token)) {
      if (pending || current < 0) return null;
      pending = { offset, token };
    } else if (/^[0-9%]/.test(token)) {
      if (current < 0) return null;
      const start = rings.get(token);
      const bond = pending ?? { offset, token: "" };
      if (start) {
        // A direction at the opening marker is already part of the source.
        // Retain it and use its orientation when assigning adjacent slashes.
        const opening = start.bond.token;
        const expected = opening === "/" ? "\\" : opening === "\\" ? "/" : opening;
        if (pending && opening && pending.token !== expected) return null;
        bonds.push(start.bond.token
          ? { from: start.atom, to: current, ...start.bond }
          : { from: current, to: start.atom, ...bond });
        rings.delete(token);
      } else rings.set(token, { atom: current, bond });
      pending = undefined;
    } else if (token === "(") {
      if (current < 0 || pending) return null;
      branches.push(current);
    } else if (token === ")") {
      if (!branches.length || pending) return null;
      current = branches.pop()!;
    } else if (token === ".") {
      if (current < 0 || pending) return null;
      current = -1;
    } else {
      const next = atoms.length;
      atoms.push(token);
      if (current >= 0) {
        bonds.push({ from: current, to: next, ...(pending ?? { offset, token: "" }) });
      }
      current = next;
      pending = undefined;
    }
  }
  return current >= 0 && !branches.length && !rings.size && !pending ? { atoms, bonds } : null;
}

export function hasAlleneShorthand(text: string) {
  const chiralCarbon = /\[(?:\d+)?C@@?(?:[+-]\d*|:\d+)*\]/;
  if (!chiralCarbon.test(text)) return false;
  const graph = bondPositions(text);
  if (!graph) return null;
  const doubleBonds = new Map<number, number>();
  for (const bond of graph.bonds) {
    if (bond.token !== "=") continue;
    for (const atom of [bond.from, bond.to])
      doubleBonds.set(atom, (doubleBonds.get(atom) ?? 0) + 1);
  }
  return graph.atoms.some((atom, index) => chiralCarbon.test(atom) && doubleBonds.get(index) === 2);
}

export function ringStereoEntries(annotation: string) {
  return [...annotation.matchAll(/(?:^|,)([ct]):(\d+(?:,\d+)*)/g)].flatMap(
    ([, kind, indices]) => indices.split(",").map((index) => [Number(index), kind === "c"] as const),
  );
}

/** Translate only indexed ring geometry. The caller must verify the result. */
export function writeRingStereo(text: string, annotation: string) {
  const graph = bondPositions(text);
  if (!graph) return null;
  const { bonds } = graph;
  const neighbors = new Map<number, Bond[]>();
  for (const bond of bonds) {
    for (const end of [bond.from, bond.to]) {
      const adjacent = neighbors.get(end) ?? [];
      adjacent.push(bond);
      neighbors.set(end, adjacent);
    }
  }
  const other = (bond: Bond, atom: number) => bond.from === atom ? bond.to : bond.from;
  const reference = (atom: number, opposite: number) => neighbors.get(atom)
    ?.filter((bond) => other(bond, atom) !== opposite)
    .sort((a, b) => other(a, atom) - other(b, atom))[0];
  const assignments = new Map<Bond, string>();
  const outward = (bond: Bond, atom: number, marker: string) =>
    (marker === "/" ? 1 : -1) * (bond.from === atom ? 1 : -1);
  const assigned = (bond: Bond, atom: number) => {
    const marker = assignments.get(bond) ?? bond.token;
    return marker === "/" || marker === "\\" ? outward(bond, atom, marker) : 0;
  };
  const seen = new Set<number>();
  for (const [index, cis] of ringStereoEntries(annotation)) {
    const double = bonds[index];
    if (seen.has(index) || double?.token !== "=") return null;
    seen.add(index);
    const { from, to } = double;
    const a = reference(from, to);
    const b = reference(to, from);
    if (!a || !b || !/^(?:[-/\\])?$/.test(a.token) || !/^(?:[-/\\])?$/.test(b.token)) return null;
    const aDirection = assigned(a, from);
    const bDirection = assigned(b, to);
    const parity = cis ? 1 : -1;
    if (aDirection && bDirection && aDirection !== bDirection * parity) return null;
    const aRequired = aDirection || (bDirection ? bDirection * parity : 1);
    assignments.set(a, outward(a, from, "/") === aRequired ? "/" : "\\");
    assignments.set(b, outward(b, to, "/") === aRequired * parity ? "/" : "\\");
  }
  let offset = text.length;
  let output = "";
  for (const [bond, marker] of [...assignments].sort(([a], [b]) => b.offset - a.offset)) {
    output = marker + text.slice(bond.offset + bond.token.length, offset) + output;
    offset = bond.offset;
  }
  return assignments.size ? text.slice(0, offset) + output : null;
}
