import { expect, it } from "vitest";
import { parsePDB } from "molstar/lib/mol-io/reader/pdb/parser";
import { trajectoryFromPDB } from "molstar/lib/mol-model-formats/structure/pdb";
import { Structure } from "molstar/lib/mol-model/structure";
import { boundPair, ligandLoci } from "./bound-pairs";

async function structure(x: string) {
  const parsed = await parsePDB(
    `HETATM    1  C1  LIG A   1       ${x}   2.000   3.000  1.00  0.00           C  \nEND\n`,
  ).run();
  if (parsed.isError) throw new Error(parsed.message);
  return Structure.ofModel(
    (await trajectoryFromPDB(parsed.result).run()).representative,
  );
}
it("isolates each alternative bound ligand and keeps source models and coordinates intact", async () => {
  const protein = await structure("1.000"),
    a = await structure("2.000"),
    b = await structure("3.000");
  const before = [protein, a, b].map((s) =>
    Array.from(s.models[0].atomicConformation.x),
  );
  const pairA = boundPair(protein, a),
    pairB = boundPair(protein, b);
  expect(pairA.models).toContain(protein.models[0]);
  expect(pairA.models).toContain(a.models[0]);
  expect(pairA.models).not.toContain(b.models[0]);
  expect(pairB.models).not.toContain(a.models[0]);
  expect(new Set(pairA.units.map((u) => u.id)).size).toBe(pairA.units.length);
  const loci = ligandLoci(pairA, a.models);
  expect(loci.elements).toHaveLength(1);
  expect(loci.elements[0].unit.model).toBe(a.models[0]);
  expect(
    [protein, a, b].map((s) => Array.from(s.models[0].atomicConformation.x)),
  ).toEqual(before);
});
