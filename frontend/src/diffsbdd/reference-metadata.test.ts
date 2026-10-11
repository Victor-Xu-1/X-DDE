import { afterEach, expect, it, vi } from "vitest";
import { request } from "../api";
import { resolveReference } from "./reference-metadata";
vi.mock("../api", () => ({ request: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const metadata = {
  id: "file",
  sha256: "a".repeat(64),
  kind: "ligand",
  suffix: ".sdf",
  size: 1000,
};
const reference = {
  asset_id: "file",
  sha256: metadata.sha256,
  record: 12,
  conformer: 3,
  version_id: "original-version",
};
it("preserves the exact declared molecular version, record and conformer", async () => {
  vi.mocked(request).mockResolvedValue(metadata);
  await expect(
    resolveReference(
      "file",
      "ligand",
      [".sdf"],
      reference,
      new AbortController().signal,
    ),
  ).resolves.toBe(reference);
  expect(request).toHaveBeenCalledWith(
    "/assets/file/metadata",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});
it.each([
  { id: "other" },
  { sha256: "b".repeat(64) },
  { sha256: "bad" },
  { size: 0 },
  { size: 1.5 },
  { kind: "structure" },
  { suffix: ".pdb" },
])(
  "rejects contradictory metadata rather than changing the saved reference: %j",
  async (change) => {
    vi.mocked(request).mockResolvedValue({ ...metadata, ...change });
    await expect(
      resolveReference(
        "file",
        "ligand",
        [".sdf"],
        reference,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  },
);
it.each([
  { record: -1 },
  { record: 500 },
  { record: 1.5 },
  { conformer: 1000 },
  { asset_id: "other" },
])("rejects invalid record/conformer identity %j", async (change) => {
  vi.mocked(request).mockResolvedValue(metadata);
  await expect(
    resolveReference(
      "file",
      "ligand",
      [".sdf"],
      { ...reference, ...change },
      new AbortController().signal,
    ),
  ).rejects.toThrow("identity");
});
it.each([{ record: 1 }, { conformer: 1 }, { sha256: "b".repeat(64) }])(
  "rejects an inconsistent saved sequence reference %j",
  async (change) => {
    vi.mocked(request).mockResolvedValue({
      ...metadata,
      kind: "sequences",
      suffix: ".fasta",
    });
    await expect(
      resolveReference(
        "file",
        "sequences",
        [".fasta"],
        { ...reference, record: 0, conformer: 0, ...change },
        new AbortController().signal,
      ),
    ).rejects.toThrow("identity");
  },
);
it("rejects an oversized historical sequence before authorizing the task input", async () => {
  vi.mocked(request).mockResolvedValue({
    ...metadata,
    kind: "sequences",
    suffix: ".fasta",
    size: 2 * 1024 ** 2 + 1,
  });
  await expect(
    resolveReference(
      "file",
      "sequences",
      [".fasta"],
      undefined,
      new AbortController().signal,
    ),
  ).rejects.toThrow("format");
});
