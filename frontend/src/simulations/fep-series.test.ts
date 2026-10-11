import { afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  fepRecordNames,
  readFepSeries,
  validFepSelection,
  fepSeriesLimit,
} from "./fep-series";

afterEach(() => vi.unstubAllGlobals());
const block = (title: string) =>
  `${title}\nprogram\ncomment\n  0  0  0  0  0  0            999 V2000\nM  END\n`;
it("retains empty names, CRLF and original record offsets without dropping or joining records", () => {
  expect(
    fepRecordNames(
      `${block("")}$$$$\n${block("STAT6 member")}`.replaceAll("\n", "\r\n"),
    ),
  ).toEqual([
    { record: 0, name: "" },
    { record: 1, name: "STAT6 member" },
  ]);
  expect(() =>
    fepRecordNames(`${block("A")}$$$$\n$$$$\n${block("B")}`),
  ).toThrow("format");
  expect(() => fepRecordNames(`${block("A")}$$$$\n`.repeat(501))).toThrow(
    "limit",
  );
});
it("requires loaded distinct in-range original records, even for a restored task", () => {
  const records = fepRecordNames(`${block("A")}$$$$\n${block("B")}`);
  expect(validFepSelection(records, [0, 1])).toBe(true);
  for (const selection of [[0], [0, 0], [0, 2], [-1, 1], [0, 0.5]])
    expect(validFepSelection(records, selection)).toBe(false);
  expect(validFepSelection(undefined, [0, 1])).toBe(false);
});
it("rejects oversize metadata before downloading and stops a stream exceeding its declared size", async () => {
  const reference = {
    asset_id: "series",
    sha256: "a".repeat(64),
    record: 0,
    conformer: 0,
  };
  const metadata = {
    id: "series",
    sha256: reference.sha256,
    kind: "ligand",
    suffix: ".sdf",
    size: fepSeriesLimit + 1,
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(metadata)));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    readFepSeries(reference, new AbortController().signal),
  ).rejects.toThrow("limit");
  expect(fetcher).toHaveBeenCalledTimes(1);
  const cancel = vi.fn();
  fetcher
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ...metadata, size: 2 })),
    )
    .mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(3));
          },
          cancel,
        }),
      ),
    );
  await expect(
    readFepSeries(reference, new AbortController().signal),
  ).rejects.toThrow("identity");
  expect(cancel).toHaveBeenCalledOnce();
});
it("reads only the exact SHA-256 source bytes and rejects equal-sized altered content", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const text = `${block("A")}$$$$\n${block("B")}$$$$\n`;
  const bytes = new TextEncoder().encode(text);
  const hash = Array.from(
    new Uint8Array(await webcrypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const reference = {
    asset_id: "series",
    sha256: hash,
    record: 0,
    conformer: 0,
  };
  const metadata = {
    id: "series",
    sha256: hash,
    kind: "ligand",
    suffix: ".sdf",
    size: bytes.length,
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(metadata)))
    .mockResolvedValueOnce(new Response(bytes));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    readFepSeries(reference, new AbortController().signal),
  ).resolves.toEqual([
    { record: 0, name: "A" },
    { record: 1, name: "B" },
  ]);
  fetcher
    .mockResolvedValueOnce(new Response(JSON.stringify(metadata)))
    .mockResolvedValueOnce(new Response(text.replace("A\n", "X\n")));
  await expect(
    readFepSeries(reference, new AbortController().signal),
  ).rejects.toThrow("identity");
});
