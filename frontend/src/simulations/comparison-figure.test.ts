import { afterEach, expect, it, vi } from "vitest";
import { comparisonFigure } from "./comparison-figure";
import { defaultFigure } from "../publication/settings";
import type { MolecularViewHandle } from "./molecular-view-state";
afterEach(() => vi.restoreAllMocks());

function setup() {
  const drawn = vi.fn(),
    close = vi.fn(),
    text = vi.fn();
  const context = {
    measureText: (value: string) => ({ width: value.length * 25 }),
    fillRect: vi.fn(),
    fillText: text,
    drawImage: drawn,
    font: "",
    textBaseline: "",
    fillStyle: "",
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) => callback(new Blob(["composed"], { type: "image/png" })),
  );
  const calls: { width: number; height: number }[] = [];
  const handle = {
    capture: vi.fn(async (_settings, pixels) => {
      calls.push(pixels);
      return new Blob([String(calls.length - 1)], { type: "image/png" });
    }),
  } as unknown as MolecularViewHandle;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (blob: Blob) => {
      const index = Number(await blob.text());
      return { ...calls[index], close };
    }),
  );
  return { handle, calls, drawn, close, text, context };
}
afterEach(() => vi.unstubAllGlobals());
it("requests final panel pixels and composes them without resampling native molecular images", async () => {
  const native = setup();
  const result = await comparisonFigure(
    defaultFigure,
    [native.handle, native.handle],
    ["STAT6-A", "STAT6-B"],
  );
  expect(result.type).toBe("image/png");
  expect(native.calls).toHaveLength(2);
  expect(
    native.calls[0].width +
      native.calls[1].width +
      Math.round((4 * 600) / 25.4),
  ).toBe(2102);
  expect(native.context.font).toBe(
    "600 58.333333333333336px Arial, sans-serif",
  );
  expect(native.drawn.mock.calls.every((call) => call.length === 3)).toBe(true);
  expect(native.text.mock.calls.map((call) => call[0])).toEqual([
    "A · STAT6-A",
    "B · STAT6-B",
  ]);
  expect(native.close).toHaveBeenCalledTimes(2);
});
it("refuses changed native pixel sizes instead of resizing a panel or accepting a false download", async () => {
  const native = setup();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 12, height: 12, close: native.close })),
  );
  await expect(
    comparisonFigure(defaultFigure, [native.handle, native.handle], ["A", "B"]),
  ).rejects.toThrow("different image dimensions");
  expect(native.drawn).not.toHaveBeenCalled();
  expect(native.close).toHaveBeenCalledOnce();
});
it("rejects oversized labels before rendering either molecular panel", async () => {
  const native = setup();
  await expect(
    comparisonFigure(
      defaultFigure,
      [native.handle, native.handle],
      ["a".repeat(241), "B"],
    ),
  ).rejects.toThrow("identifiers");
  expect(native.handle.capture).not.toHaveBeenCalled();
});
it("does not encode a partial comparison if the second native panel fails", async () => {
  const native = setup();
  const failure = {
    capture: vi.fn().mockRejectedValue(new Error("Native B view failed")),
  } as unknown as MolecularViewHandle;
  await expect(
    comparisonFigure(defaultFigure, [native.handle, failure], ["A", "B"]),
  ).rejects.toThrow("Native B view failed");
  expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
  expect(native.close).toHaveBeenCalledOnce();
});
