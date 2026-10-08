import { afterAll, expect, it, vi } from "vitest";
const worker = vi.hoisted(() =>
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:charge-theme-worker"),
);
afterAll(() => worker.mockRestore());
import { parsePDB } from "molstar/lib/mol-io/reader/pdb/parser";
import { trajectoryFromPDB } from "molstar/lib/mol-model-formats/structure/pdb";
import { Structure, StructureElement } from "molstar/lib/mol-model/structure";
import { ChargeTheme, chargeCoverage } from "./charge-theme";
import { partialCharge, chargeColor } from "../viewer/charge-surface";

it("uses the shared protein partial-charge policy without changing native coordinates", async () => {
  const parsed = await parsePDB(
    "ATOM      1  N   ALA A   1       1.000   2.000   3.000  1.00  0.00           N  \nEND\n",
  ).run();
  if (parsed.isError) throw new Error(parsed.message);
  const trajectory = await trajectoryFromPDB(parsed.result).run();
  const model = trajectory.representative;
  const structure = Structure.ofModel(model);
  const location = StructureElement.Location.create(
    structure,
    structure.units[0],
    structure.units[0].elements[0],
  );
  const before = Array.from(model.atomicConformation.x);
  const theme = ChargeTheme.factory({ structure }, {});
  expect(theme.color(location, false)).toBe(
    chargeColor(partialCharge({ atom: "N", resn: "ALA" }, true, false)),
  );
  expect(chargeCoverage(structure)).toEqual({
    total: 1,
    estimated: 1,
    missing: 0,
    input: 0,
  });
  expect(Array.from(model.atomicConformation.x)).toEqual(before);
});
