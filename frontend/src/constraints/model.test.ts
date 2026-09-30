import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { currentConditions, withConstraints } from "./model";
import { task } from "../docking/model";
import { defaults } from "../docking/generated";
const ref = {
    asset_id: "ligand",
    sha256: "a".repeat(64),
    record: 0,
    conformer: 0,
  },
  receptor = { ...ref, asset_id: "receptor" };
const request = task(
  "dock",
  receptor,
  ref,
  defaults,
  null,
  { center: [1, 2, 3], size: [20, 20, 20], unit: "angstrom" },
  false,
  "dock",
);
afterEach(() => vi.restoreAllMocks());
it("captures exact version and receptor coordinates, without an arbitrary world frame", async () => {
  const doc = await currentConditions(
    request,
    "search",
    null,
    () => "condition",
  );
  expect(doc.subject).toEqual(ref);
  expect(doc.frame?.reference).toEqual(receptor);
  expect(doc.conditions[0]).toMatchObject({
    kind: "search_box",
    scope: "target_a",
    strength: "hard",
    phase: "input",
  });
  expect(doc.conditions[0]).toHaveProperty(
    "box",
    request.search?.kind === "box" ? request.search.box : null,
  );
});
it("fails closed on unsupported conditions and retains the exact reference when executable", async () => {
  const reference = { id: "conditions", sha256: "b".repeat(64) },
    post = vi.spyOn(api, "post");
  post.mockResolvedValue({
    executable: false,
    conditions: [
      { supported: false, reason_code: "wrong_frame", reason: "bad frame" },
    ],
  } as never);
  await expect(withConstraints(request, reference, "zh")).rejects.toThrow(
    "坐标参照",
  );
  post.mockResolvedValue({ executable: true, conditions: [] } as never);
  expect(await withConstraints(request, reference, "en")).toMatchObject({
    constraints: reference,
  });
  expect(await withConstraints(request, null, "en")).toBe(request);
});

it("requires a saved matching output choice rather than silently using old conditions", async () => {
  await expect(
    withConstraints(request, null, "en", "all_heavy_atoms"),
  ).rejects.toThrow("Save the selected output check");
  const reference = { id: "conditions", sha256: "b".repeat(64) };
  vi.spyOn(api, "post").mockResolvedValue({
    executable: true,
    conditions: [],
    document: {
      conditions: [
        {
          kind: "spatial_bounds",
          selection: "heavy_atom_centroid",
          strength: "hard",
          weight: null,
          tolerance_angstrom: 0.001,
        },
      ],
    },
  } as never);
  await expect(
    withConstraints(request, reference, "en", "all_heavy_atoms"),
  ).rejects.toThrow("Output choices differ");
  await expect(
    withConstraints(request, reference, "en", "heavy_atom_centroid", {
      strength: "soft",
      weight: 2,
      tolerance_angstrom: 0.001,
    }),
  ).rejects.toThrow("Output check settings differ");
  expect(
    await withConstraints(request, reference, "en", "heavy_atom_centroid", {
      strength: "hard",
      weight: 1,
      tolerance_angstrom: 0.001,
    }),
  ).toMatchObject({ constraints: reference });
});

it("supports output-only condition drafts for scoring without inventing a native search box", async () => {
  const score = {
    ...request,
    mode: "score",
    search: null,
    pose_frame: receptor,
    pose_coordinate_basis: "user_confirmed",
  } as const;
  const doc = await currentConditions(score, "output", null, () => "condition");
  expect(doc.frame?.reference).toEqual(receptor);
  expect(doc.conditions).toEqual([]);
  expect(doc.subject).toEqual(ref);
});
