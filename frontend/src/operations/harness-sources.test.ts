import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { harnessAssetIds, resolveHarnessSources } from "./harness-sources";
import type { MoleculeRef } from "../research/types";

const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const asset = {
  id,
  name: "experimental-complex.pdb",
  kind: "structure",
  suffix: ".pdb",
  size: 900,
  sha256: "a".repeat(64),
  created_at: "2026-10-20",
};
afterEach(() => vi.restoreAllMocks());

it("uses declared native file fields, including nested fields, without inventing edges from names", () => {
  expect(
    harnessAssetIds({
      structure_paths: [`asset:${id}`, `asset:${id}`],
      candidate_names: [`asset:${other}`],
      options: { initial_structure_path: `asset:${other}` },
    }),
  ).toEqual([id, other]);
  expect(() =>
    harnessAssetIds({ structure_path: "/private/server/file.pdb" }),
  ).toThrow(/uploaded file/);
  expect(harnessAssetIds({ structure_path: "", structure_paths: [] })).toEqual(
    [],
  );
});

it("records actual fresh-upload hashes and preserves an explicit saved version", async () => {
  vi.spyOn(client, "request").mockResolvedValue(asset);
  const signal = new AbortController().signal;
  expect((await resolveHarnessSources([id], [], signal)).references).toEqual([
    {
      asset_id: id,
      sha256: asset.sha256,
      record: 0,
      conformer: 0,
      version_id: null,
    },
  ]);
  const saved: MoleculeRef = {
    asset_id: id,
    sha256: asset.sha256,
    record: 0,
    conformer: 0,
    version_id: other,
  };
  expect(
    (await resolveHarnessSources([id], [saved], signal)).references,
  ).toEqual([saved]);
});

it("fails closed on a missing, substituted or malformed file rather than replacing provenance", async () => {
  const request = vi.spyOn(client, "request");
  const signal = new AbortController().signal;
  request.mockRejectedValueOnce(new Error("not found"));
  await expect(resolveHarnessSources([id], [], signal)).rejects.toThrow(
    "not found",
  );
  request.mockResolvedValue({ ...asset, id: other });
  await expect(resolveHarnessSources([id], [], signal)).rejects.toThrow(
    /metadata/,
  );
  request.mockResolvedValue({ ...asset, sha256: "wrong" });
  await expect(resolveHarnessSources([id], [], signal)).rejects.toThrow(
    /metadata/,
  );
  request.mockResolvedValue(asset);
  await expect(
    resolveHarnessSources(
      [id],
      [{ asset_id: id, sha256: "b".repeat(64), record: 0, conformer: 0 }],
      signal,
    ),
  ).rejects.toThrow(/retained scientific reference/);
  await expect(
    resolveHarnessSources(
      [id],
      [{ asset_id: id, sha256: asset.sha256, record: 1, conformer: 0 }],
      signal,
    ),
  ).rejects.toThrow(/whole-file/);
});

it("does not publish metadata after cancellation", async () => {
  const controller = new AbortController();
  vi.spyOn(client, "request").mockImplementation(async () => {
    controller.abort();
    return asset as never;
  });
  await expect(
    resolveHarnessSources([id], [], controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
});
