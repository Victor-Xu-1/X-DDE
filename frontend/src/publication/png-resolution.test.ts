import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, expect, it, vi } from "vitest";
import { pngResolution, dataUrlBlob } from "./png-resolution";

beforeEach(() => vi.stubGlobal("Blob", NodeBlob));
// Native 1x1 transparent PNG, not scientific/demo geometry.
const native =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
function chunks(data: Uint8Array) {
  const result = new Map<string, Uint8Array>();
  for (let offset = 8; offset < data.length;) {
    const length = new DataView(data.buffer).getUint32(offset);
    result.set(
      new TextDecoder().decode(data.slice(offset + 4, offset + 8)),
      data.slice(offset + 8, offset + 8 + length),
    );
    offset += length + 12;
  }
  return result;
}
it("adds DPI metadata without changing native image pixels and replaces existing resolution", async () => {
  const original = await dataUrlBlob("data:image/png;base64," + native);
  const output = await pngResolution(original, 600);
  const inputChunks = chunks(new Uint8Array(await original.arrayBuffer()));
  const outputChunks = chunks(new Uint8Array(await output.arrayBuffer()));
  expect(outputChunks.get("IDAT")).toEqual(inputChunks.get("IDAT"));
  const physical = outputChunks.get("pHYs")!;
  expect(new DataView(physical.buffer).getUint32(0)).toBe(
    Math.round(600 / 0.0254),
  );
  expect(physical[8]).toBe(1);
  const replaced = chunks(
    new Uint8Array(await (await pngResolution(output, 300)).arrayBuffer()),
  );
  expect(new DataView(replaced.get("pHYs")!.buffer).getUint32(4)).toBe(
    Math.round(300 / 0.0254),
  );
});
it("rejects corrupted signatures, CRCs and truncated native files instead of emitting broken exports", async () => {
  const source = new Uint8Array(
    await (await dataUrlBlob("data:image/png;base64," + native)).arrayBuffer(),
  );
  for (const offset of [4, 32]) {
    const invalid = source.slice();
    invalid[offset] ^= 1;
    await expect(
      pngResolution(new Blob([invalid], { type: "image/png" }), 600),
    ).rejects.toThrow();
  }
  await expect(
    pngResolution(new Blob([source.slice(0, -5)]), 600),
  ).rejects.toThrow();
});
it("decodes only bounded native figure data locally under the existing CSP", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const svg = await dataUrlBlob(
    "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent("<svg><text>ΔG ± 0.2</text></svg>"),
  );
  expect(await svg.text()).toContain("ΔG ± 0.2");
  expect(fetch).not.toHaveBeenCalled();
  await expect(dataUrlBlob("data:text/html,<script/>")).rejects.toThrow();
});
