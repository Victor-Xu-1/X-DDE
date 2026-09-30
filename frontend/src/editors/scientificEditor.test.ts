import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import type { ScientificObject } from "../research/types";
import { MoleculeSaveIntent, molecularRecord } from "./scientificEditor";

const original: ScientificObject = {
  id: "version-1",
  family_id: "family",
  kind: "molecule",
  label: "a".repeat(120),
  reference: {
    asset_id: "file",
    sha256: "a".repeat(64),
    record: 1,
    conformer: 0,
    version_id: "version-1",
  },
  parent_id: null,
  source_job: null,
  relation: "derived_from",
  notes: "retained",
  rating: 4,
  created_at: "2026-09-30",
  validation: "file_integrity_only",
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("opens exactly the selected SDF record and refuses unsupported conversion", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("first\n$$$$\nsecond\n$$$$\n", {
        headers: { "X-Structure-Format": "sdf" },
      }),
    ),
  );
  const record = await molecularRecord(original, new AbortController().signal);
  expect(record).toContain("second");
  expect(record).not.toContain("first");
  vi.mocked(fetch).mockResolvedValue(
    new Response("MOL2 file", { headers: { "X-Structure-Format": "mol2" } }),
  );
  await expect(
    molecularRecord(original, new AbortController().signal),
  ).rejects.toThrow(/Convert/);
});

it("retries an uncertain save with the same intent and retains version lineage", async () => {
  vi.spyOn(api, "upload").mockResolvedValue({
    id: "file-2",
    name: "sketched-molecule.sdf",
  } as never);
  const post = vi
    .spyOn(api, "post")
    .mockRejectedValueOnce(new Error("timeout after write"))
    .mockResolvedValue({ ...original, id: "version-2" });
  const intent = new MoleculeSaveIntent();
  await expect(intent.save("molecule", original)).rejects.toThrow("timeout");
  await intent.save("molecule", original);
  expect(post.mock.calls[0][2]).toBe(post.mock.calls[1][2]);
  expect(post.mock.calls[1][1]).toMatchObject({
    parent_id: original.id,
    notes: "retained",
    rating: 4,
  });
  expect(
    (post.mock.calls[1][1] as { label: string }).label.length,
  ).toBeLessThanOrEqual(120);
  await intent.save("modified molecule", original);
  expect(post.mock.calls[2][2]).not.toBe(post.mock.calls[1][2]);
});
