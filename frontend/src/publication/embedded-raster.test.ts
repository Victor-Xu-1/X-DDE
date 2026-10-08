import { expect, it } from "vitest";
import { embeddedRaster } from "./embedded-raster";
it("permits native bounded PNG cells while rejecting active documents and image bombs", () => {
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  expect(embeddedRaster(png)).toBe(true);
  expect(embeddedRaster("data:image/svg+xml;base64,PHN2Zy8+")).toBe(false);
  expect(embeddedRaster("https://example.org/image.png")).toBe(false);
  const bytes = Uint8Array.from(atob(png.split(",")[1]), (c) =>
    c.charCodeAt(0),
  );
  new DataView(bytes.buffer).setUint32(16, 99999999);
  expect(
    embeddedRaster(
      "data:image/png;base64," + btoa(String.fromCharCode(...bytes)),
    ),
  ).toBe(false);
});
