import { expect, it } from "vitest";
import { sequenceHits, contactReport } from "./native-report";
it("parses actual native sequence report fields without replacing similarity with binding confidence", () => {
  const text =
    "1. **P01808** (score=46.804, identity=33.60%, aligned_identity=61.3%, length=119)\n - sequence: \x60EVKLLESGGGLVQPGGSLKLSC\x60\n - query-aligned natural alternatives (0-based): Q2K, V4L\n";
  expect(sequenceHits(text)[0]).toMatchObject({
    accession: "P01808",
    score: "46.804",
    identity: "33.60",
    alignedIdentity: "61.3",
    length: "119",
    alternatives: "Q2K, V4L",
  });
  expect(sequenceHits("No structural analogs found")).toEqual([]);
});
it("keeps native counts and representative contact distances distinct from full contact coverage", () => {
  const text =
    "PLIP structure analysis completed.\nCandidate: MZ1-BRD4-VHL\nReport: /srv/internal/a.txt\nInteraction counts: total=10, hbond=3\nRepresentative contacts: D:107-ARG -> A:383-GLU (hbond, 1.91 A); ... (+9 more)";
  expect(contactReport(text)[0]).toMatchObject({
    counts: { total: 10, hbond: 3 },
    contacts: [
      {
        left: "D:107-ARG",
        right: "A:383-GLU",
        kind: "hbond",
        distance: "1.91",
      },
    ],
  });
});
