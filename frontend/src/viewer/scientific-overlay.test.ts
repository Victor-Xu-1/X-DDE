import { describe, it, expect } from "vitest";
import {
  nativeInteractions,
  potentialGridInput,
  validatePotentialGrid,
} from "./scientific-data";
import { viewerLoad } from "./source-layout";

describe("Native scientific overlays", () => {
  const nativeGrid = `# Data from APBS 3.4.1
# POTENTIAL (kT/e)
object 1 class gridpositions counts 2 2 2
origin -7.194400e+01 -7.862400e+01 -5.169300e+01
delta 9.755313e-01 0.000000e+00 0.000000e+00
delta 0.000000e+00 1.039854e+00 0.000000e+00
delta 0.000000e+00 0.000000e+00 9.976979e-01
object 2 class gridconnections counts 2 2 2
object 3 class array type double rank 0 items 8         data follows
-1.5 0.0 2.5\u0020
3.0 -4.5 5.0\u0020
6.0 7.5\u0020
attribute "dep" string "positions"
object "regular positions regular connections"         class field
component "positions" value 1
component "connections" value 2
component "data" value 3
`;

  it.each(["LF", "CRLF"])(
    "loads native APBS scalars and coordinates without interpreting footer metadata as values (%s)",
    (ending) => {
      const source =
        ending === "CRLF" ? nativeGrid.replaceAll("\n", "\r\n") : nativeGrid;
      expect(validatePotentialGrid(source)).toBe(8);
      const input = potentialGridInput(source);
      expect(input.count).toBe(8);
      expect(
        input.text
          .split(/data follows\s*\n/)[1]
          .trim()
          .split(/\s+/)
          .map(Number),
      ).toEqual([-1.5, 0, 2.5, 3, -4.5, 5, 6, 7.5]);
      expect(input.text.slice(0, input.text.indexOf("data follows"))).toBe(
        source.slice(0, source.indexOf("data follows")),
      );
      expect(input.text).not.toContain('component "data"');
      expect(input.text).not.toMatch(/\s$/);
      expect(source).toContain('component "data" value 3');
    },
  );

  it("rejects missing, extra and nonfinite native potential values instead of hiding corruption", () => {
    for (const data of ["6.0", "6.0 7.5 9.0", "6.0 NaN", "6.0 Infinity"]) {
      expect(() =>
        potentialGridInput(nativeGrid.replace("6.0 7.5", data)),
      ).toThrow();
    }
  });
  it("distinguishes zero classified interactions from absent chemical analysis", () => {
    expect(nativeInteractions(undefined)).toBeUndefined();
    expect(nativeInteractions([])).toEqual([]);
    expect(() =>
      nativeInteractions([{ kind: "hydrogen_bond", distance: NaN }]),
    ).toThrow();
    expect(() =>
      nativeInteractions([
        {
          kind: "hydrogen_bond",
          chain: "A",
          number: 140,
          residue: "ASN",
          insertion_code: "BAD",
          protein_position: [1, 2, 3],
          ligand_position: [4, 2, 3],
          distance: 3,
        },
      ]),
    ).toThrow();
  });
  it("rejects oversized and incomplete potential grids", () => {
    expect(() =>
      validatePotentialGrid("object 1 class gridpositions counts 999 999 999"),
    ).toThrow();
    expect(() =>
      validatePotentialGrid("object 1 class gridpositions counts 2 2 2"),
    ).toThrow();
    expect(() =>
      viewerLoad({
        urls: ["/api/jobs/task/download"],
        comparison: false,
        electrostaticMap: { url: "a", unit: "arbitrary" },
      }),
    ).toThrow();
  });
});
