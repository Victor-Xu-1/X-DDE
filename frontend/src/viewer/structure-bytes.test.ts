import { afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { structureBytes } from "./structure-bytes";
afterEach(() => vi.unstubAllGlobals());
it("hashes exact original UTF-8 bytes before decoding and enforces streamed limits without trusting headers", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const bytes = new TextEncoder().encode("data_\u03b1\r\n#\r\n");
  const result = await structureBytes(new Response(bytes));
  const expected = Buffer.from(
    await webcrypto.subtle.digest("SHA-256", bytes),
  ).toString("hex");
  expect(result).toEqual({ text: "data_\u03b1\r\n#\r\n", sha256: expected });
  const cancel = vi.fn();
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(10_000_001));
      },
      cancel,
    }),
  );
  await expect(structureBytes(response)).rejects.toThrow(/byte limit/);
  expect(cancel).toHaveBeenCalledOnce();
});
it("rejects HTTP errors and oversized declared bodies before allocating a merged buffer", async () => {
  await expect(
    structureBytes(new Response("error", { status: 500 })),
  ).rejects.toThrow();
  await expect(
    structureBytes(
      new Response("x", { headers: { "Content-Length": "10000001" } }),
    ),
  ).rejects.toThrow();
});
