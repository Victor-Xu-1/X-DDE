import { afterEach, expect, it, vi } from "vitest";
import {
  parseFasta,
  readSequenceFile,
  SequencePreviewError,
} from "./fasta-file";

afterEach(() => vi.unstubAllGlobals());
it("retains record headers, case and ambiguity without inferring molecular type", () => {
  expect(
    parseFasta(
      ">sp|P42226|STAT6_HUMAN canonical\r\nMSc LW*\r\n;source comment\r\n>X RNA?\r\nAcGN-u.?\r\n",
    ),
  ).toEqual([
    { header: "sp|P42226|STAT6_HUMAN canonical", sequence: "MScLW*" },
    { header: "X RNA?", sequence: "AcGN-u.?" },
  ]);
});
it.each(["ACTG", ">empty\n>next\nACTG", ">bad\nAC12", ">\nACTG"])(
  "rejects ambiguous/non-FASTA input rather than changing it: %s",
  (text) => {
    expect(() => parseFasta(text)).toThrow(SequencePreviewError);
  },
);
it("bounds record count before creating a large inspection UI", () => {
  expect(() => parseFasta(">record\nAX?\n".repeat(501))).toThrow("limit");
});
it("rejects stale reference metadata without reading or displaying another file", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: "other",
        sha256: "a".repeat(64),
        kind: "sequences",
        suffix: ".fasta",
        size: 10,
      }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    readSequenceFile(
      { asset_id: "chosen", sha256: "a".repeat(64), record: 0, conformer: 0 },
      new AbortController().signal,
    ),
  ).rejects.toThrow("identity");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
