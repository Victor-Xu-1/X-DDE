import { expect, it } from "vitest";
import type { Job } from "../types";
import {
  candidateStructure,
  resultStructureFiles,
  sequenceCandidateResult,
} from "./candidate-structures";
import type { OperationResult } from "./types";
it("binds only explicit native file names, regardless of file order or equal candidate counts", () => {
  expect(
    candidateStructure({ structure_path: "b.cif" }, ["a.cif", "b.cif"]),
  ).toBe("b.cif");
  expect(candidateStructure({ sequence: "EVQL" }, ["a.cif"])).toBeNull();
  expect(
    candidateStructure(
      {
        structure_path: "missing.cif",
        metadata: { fold: { structure_path: ["a.cif"] } },
      },
      ["a.cif"],
    ),
  ).toBeNull();
  expect(
    candidateStructure({ metadata: { fold: { structure_path: ["a.cif"] } } }, [
      "a.cif",
    ]),
  ).toBe("a.cif");
  expect(
    candidateStructure(
      { metadata: { fold: { structure_path: ["a.cif", "b.cif"] } } },
      ["a.cif", "b.cif"],
    ),
  ).toBeNull();
  expect(
    candidateStructure({ structure_path: "../a.cif" }, ["../a.cif"]),
  ).toBeNull();
});
it("does not assign malformed, empty or unavailable native candidates and preserves registered files", () => {
  const job = { request: { operation: "harness", tool: "fold" } } as Job;
  const data = {
    operation: "harness",
    complete: true,
    result: { candidates: [{ structure_path: "a.cif" }] },
    structures: ["a.cif", "a.cif"],
    structure: "b.cif",
  } as OperationResult;
  expect(sequenceCandidateResult(job, data)).toEqual([
    { structure_path: "a.cif" },
  ]);
  expect(resultStructureFiles(data)).toEqual(["a.cif", "b.cif"]);
  expect(
    sequenceCandidateResult(job, {
      ...data,
      result: { available: false, result: data.result },
    }),
  ).toBeNull();
  expect(
    sequenceCandidateResult(job, {
      ...data,
      result: { available: false, candidates: [{ structure_path: "a.cif" }] },
    }),
  ).toBeNull();
  expect(
    sequenceCandidateResult(job, { ...data, result: { candidates: [] } }),
  ).toBeNull();
  expect(
    sequenceCandidateResult(job, { ...data, result: { candidates: [null] } }),
  ).toBeNull();
});
