import { describe, expect, it } from "vitest";
import { depictionDataUrl } from "./depiction-renderer";

describe("Native SVG image transport under the platform CSP", () => {
  it("preserves the drawing bytes in an allowed image data URL", async () => {
    const drawing =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>Cl–N</text></svg>';
    const url = await depictionDataUrl(
      new Blob([drawing], { type: "image/svg+xml" }),
    );
    expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
    const bytes = Uint8Array.from(atob(url.split(",")[1]), (byte) =>
      byte.charCodeAt(0),
    );
    expect(new TextDecoder().decode(bytes)).toBe(drawing);
  });
  it("refuses empty, non-image and oversized payloads", async () => {
    for (const blob of [
      new Blob([], { type: "image/svg+xml" }),
      new Blob(["<html>"], { type: "text/html" }),
      new Blob([new Uint8Array(2 * 1024 ** 2 + 1)], { type: "image/svg+xml" }),
    ])
      await expect(depictionDataUrl(blob)).rejects.toThrow(
        "bounded native SVG",
      );
  });
});
