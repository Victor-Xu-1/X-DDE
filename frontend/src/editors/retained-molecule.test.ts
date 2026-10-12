import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { molecularRecord } from "./scientificEditor";
import { readAssetFile } from "../research/asset-file";
import type { ScientificObject } from "../research/types";

const mol =
  "\r\n  fixture  2D\r\n\r\n  1  0  0  0  0  0            999 V2000\r\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\r\nM  END\r\n";
const second = mol.replace(" C   ", " N   ");
const sdf = `${mol}$$$$\r\n${second}$$$$\r\n`;
const limit = 5 * 1024 ** 2;
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
function fixture(text = sdf, suffix = ".sdf", record = 1) {
  const object = {
    id: "version-1",
    kind: "molecule",
    reference: {
      asset_id: "chosen/id",
      sha256: digest(text),
      record,
      conformer: 0,
      version_id: "version-1",
    },
  } as ScientificObject;
  const metadata = {
    id: object.reference.asset_id,
    sha256: object.reference.sha256,
    kind: "ligand",
    suffix,
    size: new TextEncoder().encode(text).length,
  };
  const fetcher = vi.fn(async (url: string) =>
    url.endsWith("/metadata")
      ? new Response(JSON.stringify(metadata))
      : new Response(text, {
          headers: { "X-Structure-Format": suffix.slice(1) },
        }),
  );
  vi.stubGlobal("fetch", fetcher);
  return { object, metadata, fetcher };
}
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps exact selected SDF bytes, blank header lines and record identity", async () => {
  const { object, fetcher } = fixture();
  const before = structuredClone(object);
  expect(await molecularRecord(object, new AbortController().signal)).toBe(
    second,
  );
  expect(object).toEqual(before);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    "/api/assets/chosen%2Fid/metadata",
    "/api/assets/chosen%2Fid",
  ]);
});
it("keeps MOL bytes and refuses nonzero MOL record selection", async () => {
  const { object } = fixture(mol, ".mol", 0);
  expect(await molecularRecord(object, new AbortController().signal)).toBe(mol);
  object.reference.record = 1;
  await expect(
    molecularRecord(object, new AbortController().signal),
  ).rejects.toThrow("no selectable SDF records");
});
it("rejects equal-size changed source before accepting the selected record", async () => {
  const { object, fetcher } = fixture();
  const changed = sdf.replace(" C   ", " N   ");
  expect(changed.length).toBe(sdf.length);
  fetcher.mockImplementation(async (url: string) =>
    url.endsWith("/metadata")
      ? new Response(
          JSON.stringify({
            id: object.reference.asset_id,
            sha256: object.reference.sha256,
            kind: "ligand",
            suffix: ".sdf",
            size: sdf.length,
          }),
        )
      : new Response(changed),
  );
  await expect(
    molecularRecord(object, new AbortController().signal),
  ).rejects.toThrow("does not match");
});
it.each([{ id: "other" }, { sha256: "b".repeat(64) }])(
  "rejects mismatched metadata %j before downloading",
  async (delta) => {
    const { object, metadata, fetcher } = fixture();
    Object.assign(metadata, delta);
    await expect(
      molecularRecord(object, new AbortController().signal),
    ).rejects.toThrow("does not match");
    expect(fetcher).toHaveBeenCalledOnce();
  },
);
it.each([{ kind: "protein" }, { suffix: ".mol2" }])(
  "rejects unsupported metadata %j before downloading",
  async (delta) => {
    const { object, metadata, fetcher } = fixture();
    Object.assign(metadata, delta);
    await expect(
      molecularRecord(object, new AbortController().signal),
    ).rejects.toThrow("Convert");
    expect(fetcher).toHaveBeenCalledOnce();
  },
);
it.each([0, -1, 1.5, limit + 1])(
  "rejects invalid declared byte count %s before downloading",
  async (size) => {
    const { object, metadata, fetcher } = fixture();
    metadata.size = size;
    await expect(
      molecularRecord(object, new AbortController().signal),
    ).rejects.toThrow("5 MiB");
    expect(fetcher).toHaveBeenCalledOnce();
  },
);
it("accepts exact byte limit and rejects an additional multi-byte character", async () => {
  const { object } = fixture("a".repeat(limit), ".mol", 0);
  expect(
    (await molecularRecord(object, new AbortController().signal)).length,
  ).toBe(limit);
  const extra = fixture("a".repeat(limit - 1) + "氮", ".mol", 0);
  await expect(
    molecularRecord(extra.object, new AbortController().signal),
  ).rejects.toThrow("5 MiB");
  expect(extra.fetcher).toHaveBeenCalledOnce();
});
it("cancels and releases a body exceeding verified size even without a length header", async () => {
  const { object, metadata, fetcher } = fixture();
  const cancel = vi.fn();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sdf + "x"));
    },
    cancel,
  });
  fetcher.mockImplementation(async (url: string) =>
    url.endsWith("/metadata")
      ? new Response(JSON.stringify(metadata))
      : new Response(stream),
  );
  await expect(
    molecularRecord(object, new AbortController().signal),
  ).rejects.toThrow("does not match");
  expect(cancel).toHaveBeenCalledOnce();
  expect(stream.locked).toBe(false);
});
it("rejects a truncated body and preserves the byte-only reader contract", async () => {
  const { object, metadata, fetcher } = fixture();
  const bytes = await readAssetFile(
    object.reference,
    new AbortController().signal,
    { kind: "ligand", suffixes: [".sdf"], maxBytes: limit },
  );
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(new TextDecoder().decode(bytes)).toBe(sdf);
  fetcher.mockImplementation(async (url: string) =>
    url.endsWith("/metadata")
      ? new Response(JSON.stringify(metadata))
      : new Response(sdf.slice(0, -1)),
  );
  await expect(
    molecularRecord(object, new AbortController().signal),
  ).rejects.toThrow("does not match");
});
it.each(["metadata", "metadata body", "body"])(
  "bounds stalled %s and preserves caller cancellation",
  async (stage) => {
    vi.useFakeTimers();
    const { object, metadata, fetcher } = fixture();
    let received: AbortSignal | undefined;
    fetcher.mockImplementation((url: string, init?: RequestInit) => {
      received = init!.signal as AbortSignal;
      if (stage === "body" && url.endsWith("/metadata"))
        return Promise.resolve(new Response(JSON.stringify(metadata)));
      if (stage === "body" || stage === "metadata body")
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                received!.addEventListener(
                  "abort",
                  () => controller.error(received!.reason),
                  { once: true },
                );
              },
            }),
          ),
        );
      return new Promise<Response>((_resolve, reject) =>
        received!.addEventListener("abort", () => reject(received!.reason), {
          once: true,
        }),
      );
    });
    const caller = new AbortController();
    const load = molecularRecord(object, caller.signal);
    const result = expect(load).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(30_000);
    await result;
    expect(received!.aborted).toBe(true);
    expect(caller.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    const nextCaller = new AbortController();
    const reason = new Error("source changed");
    const next = molecularRecord(object, nextCaller.signal);
    const cancelled = expect(next).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(0);
    nextCaller.abort(reason);
    await cancelled;
    expect(received!.reason).toBe(reason);
    expect(vi.getTimerCount()).toBe(0);
  },
);
it("does not fetch when already aborted and clears successful read timers", async () => {
  const { object, fetcher } = fixture();
  const caller = new AbortController();
  const reason = new Error("unmounted");
  caller.abort(reason);
  await expect(molecularRecord(object, caller.signal)).rejects.toBe(reason);
  expect(fetcher).not.toHaveBeenCalled();
  vi.useFakeTimers();
  const active = new AbortController();
  const remove = vi.spyOn(active.signal, "removeEventListener");
  await molecularRecord(object, active.signal);
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});
