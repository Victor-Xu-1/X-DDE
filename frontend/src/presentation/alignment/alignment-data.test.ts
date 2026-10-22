import { expect, it } from "vitest";
import { alignmentFiles, projectAlignment } from "./alignment-data";
const file = {
  artifact: "non_pairing.a3m",
  sha256: "a".repeat(64),
  bytes: 51,
  rows: 3,
  columns: 4,
};
it("retains repeated native ids, query columns, gaps and all rows without expanding lowercase insertions", () => {
  const result = projectAlignment(
    ">query\nACDE\n>same source one\nAa-DE\n>same source two\nACeD-\n",
    file,
    "ACDE",
  );
  expect(result.rows).toBe(3);
  expect(result.columns).toBe(4);
  expect(result.fasta).toBe(">1|query\nACDE\n>2|same\nA-DE\n>3|same\nACD-\n");
});
it("rejects wrong query, width, row count, bad residues, terminal separators and unsafe manifests", () => {
  const good = ">query\nACDE\n>one\nA-DE\n>two\nACD-\n";
  expect(() => projectAlignment(good, file, "ACDF")).toThrow(/query/);
  for (const bad of [
    good + "\0",
    good.replace("A-DE", "A-DEE"),
    good.replace("A-DE", "A-D"),
    good.replace("A-DE", "A?DE"),
    good + ">four\nACDE\n",
  ])
    expect(() => projectAlignment(bad, file, "ACDE")).toThrow();
  for (const change of [
    { artifact: "../escape.a3m" },
    { sha256: "invalid" },
    { bytes: 26 * 1024 ** 2 },
    { rows: 0 },
    { columns: 10001 },
    { rows: 50000, columns: 847 },
  ])
    expect(() => alignmentFiles([{ ...file, ...change }])).toThrow();
  expect(() => alignmentFiles([file, file])).toThrow();
});
it("keeps a one-query paired alignment explicitly one row", () => {
  const paired = { ...file, artifact: "pairing.a3m", rows: 1 };
  expect(projectAlignment(">query\nACDE\n", paired, "ACDE").rows).toBe(1);
  expect(alignmentFiles([file, paired])).toHaveLength(2);
});
