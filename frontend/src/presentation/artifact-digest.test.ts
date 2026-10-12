import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { artifactInfo } from "./artifact-digest";

const LIMIT = 25 * 1024 ** 2;
const url = "/api/jobs/example/artifacts/molecules.sdf";
const encoder = new TextEncoder();
const record =
  "Candidate α\nX-DDE\n\n  0  0  0  0  0  0            999 V2000\nM  END\n$$$$\n";
const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const signal = () => new AbortController().signal;

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function serve(chunks: Uint8Array[], init?: ResponseInit) {
  let readChunks = 0;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (readChunks < chunks.length)
          controller.enqueue(chunks[readChunks++]);
        else controller.close();
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  const response = new Response(body, init);
  const arrayBuffer = vi.spyOn(response, "arrayBuffer");
  const fetcher = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetcher);
  return { body, cancel, arrayBuffer, fetcher, readChunks: () => readChunks };
}

it.each([1, 7, 1024])(
  "preserves exact bytes and CRLF/multibyte records with %i-byte chunks",
  async (chunkSize) => {
    const bytes = encoder.encode(record + record.replaceAll("\n", "\r\n"));
    const chunks = Array.from(
      { length: Math.ceil(bytes.length / chunkSize) },
      (_, index) => bytes.subarray(index * chunkSize, (index + 1) * chunkSize),
    );
    const response = serve(chunks);
    const abortSignal = signal();
    await expect(artifactInfo(url, abortSignal)).resolves.toEqual({
      sha256: sha256(bytes),
      records: 2,
    });
    expect(response.fetcher).toHaveBeenCalledWith(url, { signal: abortSignal });
    expect(response.arrayBuffer).not.toHaveBeenCalled();
    expect(response.cancel).not.toHaveBeenCalled();
    expect(response.body.locked).toBe(false);
  },
);

it.each([undefined, "10"])(
  "cancels a 31 MiB stream at the first oversized chunk with content-length %s",
  async (contentLength) => {
    const chunk = new Uint8Array(1024 ** 2);
    const response = serve(
      Array<Uint8Array>(31).fill(chunk),
      contentLength ? { headers: { "content-length": contentLength } } : {},
    );
    const digest = vi.spyOn(webcrypto.subtle, "digest");
    await expect(artifactInfo(url, signal())).rejects.toThrow("too large");
    expect(response.readChunks()).toBe(26);
    expect(response.cancel).toHaveBeenCalledOnce();
    expect(response.body.locked).toBe(false);
    expect(response.arrayBuffer).not.toHaveBeenCalled();
    expect(digest).not.toHaveBeenCalled();
  },
);

it("ignores empty chunks without changing the digest or record count", async () => {
  const bytes = encoder.encode(record);
  serve([new Uint8Array(), bytes, new Uint8Array()]);
  await expect(artifactInfo(url, signal())).resolves.toEqual({
    sha256: sha256(bytes),
    records: 1,
  });
});

it("accepts a valid file exactly at the 25 MiB limit", async () => {
  const bytes = new Uint8Array(LIMIT).fill(32);
  bytes.set(encoder.encode(record));
  const response = serve([bytes.subarray(0, LIMIT - 1), bytes.subarray(-1)]);
  await expect(artifactInfo(url, signal())).resolves.toEqual({
    sha256: sha256(bytes),
    records: 1,
  });
  expect(response.cancel).not.toHaveBeenCalled();
  expect(response.body.locked).toBe(false);
});

it("rejects one byte beyond the limit and leaves later chunks unread", async () => {
  const response = serve([
    new Uint8Array(LIMIT),
    new Uint8Array(1),
    new Uint8Array(1),
  ]);
  await expect(artifactInfo(url, signal())).rejects.toThrow("too large");
  expect(response.readChunks()).toBe(2);
  expect(response.cancel).toHaveBeenCalledOnce();
});

it.each([
  { headers: { "content-length": String(LIMIT + 1) } },
  { status: 404 },
])("cancels rejected headers/status before reading the body", async (init) => {
  const response = serve([encoder.encode(record)], init);
  await expect(artifactInfo(url, signal())).rejects.toThrow("unavailable");
  expect(response.readChunks()).toBe(0);
  expect(response.cancel).toHaveBeenCalledOnce();
  expect(response.body.locked).toBe(false);
});

it.each([null, ""])("rejects an empty response body: %s", async (body) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
  await expect(artifactInfo(url, signal())).rejects.toThrow("empty");
});

it.each(["Molecule without terminator", record + "Invalid next record"])(
  "preserves rejection of invalid SDF records",
  async (text) => {
    serve([encoder.encode(text)]);
    await expect(artifactInfo(url, signal())).rejects.toThrow("valid SDF");
  },
);

it.each([10000, 10001])("preserves the %i-record boundary", async (count) => {
  const bytes = encoder.encode(record.repeat(count));
  serve([bytes]);
  const result = artifactInfo(url, signal());
  if (count === 10000)
    await expect(result).resolves.toEqual({
      sha256: sha256(bytes),
      records: count,
    });
  else await expect(result).rejects.toThrow("valid SDF");
});

it("rejects non-local URLs before fetching", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(
    artifactInfo("https://example.com/file.sdf", signal()),
  ).rejects.toThrow("local research output");
  expect(fetcher).not.toHaveBeenCalled();
});

it("preserves an already-aborted signal without fetching", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  const reason = new Error("Cancelled before loading");
  controller.abort(reason);
  await expect(artifactInfo(url, controller.signal)).rejects.toBe(reason);
  expect(fetcher).not.toHaveBeenCalled();
});

it("cancels a pending read promptly and preserves the caller's abort reason", async () => {
  const controller = new AbortController();
  const reason = new Error("Cancelled during loading");
  const cancel = vi.fn();
  let markReading!: () => void;
  const reading = new Promise<void>((resolve) => (markReading = resolve));
  const body = new ReadableStream<Uint8Array>(
    { pull: () => markReading(), cancel },
    { highWaterMark: 0 },
  );
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
  const result = artifactInfo(url, controller.signal);
  const rejected = expect(result).rejects.toBe(reason);
  await reading;
  controller.abort(reason);
  await rejected;
  expect(cancel).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledWith(reason);
  expect(body.locked).toBe(false);
});

it("preserves stream errors and releases the reader", async () => {
  const reason = new Error("Transfer failed");
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(reason);
    },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
  await expect(artifactInfo(url, signal())).rejects.toBe(reason);
  expect(body.locked).toBe(false);
});

it.each(["rejected", "pending"])(
  "does not hide or delay the size error when cancellation is %s",
  async (cleanup) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(LIMIT + 1));
      },
      cancel() {
        return cleanup === "rejected"
          ? Promise.reject(new Error("Cleanup failed"))
          : new Promise<void>(() => {});
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    await expect(artifactInfo(url, signal())).rejects.toThrow("too large");
    expect(body.locked).toBe(false);
  },
);

it("does not return a stale result when aborted during hashing", async () => {
  const controller = new AbortController();
  const reason = new Error("Cancelled during hashing");
  serve([encoder.encode(record)]);
  vi.spyOn(webcrypto.subtle, "digest").mockImplementationOnce(async () => {
    controller.abort(reason);
    return new ArrayBuffer(32);
  });
  await expect(artifactInfo(url, controller.signal)).rejects.toBe(reason);
});
