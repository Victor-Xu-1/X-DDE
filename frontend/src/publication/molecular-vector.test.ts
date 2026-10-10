import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { molecularImageOptions, molecularVector } from "./molecular-vector";
import { defaultFigure } from "./settings";

beforeEach(() => vi.stubGlobal("Blob", NodeBlob));
afterEach(() => vi.unstubAllGlobals());

// Point-sized native SVG protocol fixture, not a computed scientific result.
const native = (width = 200, extra = "") =>
  new Blob(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -3 ${width} 90"><defs><path id="nitrogen" d="M0 0L2 7L4 0"/></defs><use href="#nitrogen" transform="translate(80 20)"/><path d="M10 20L30 30" stroke="#101010" stroke-width="0.6"/>${extra}</svg>`,
    ],
    { type: "image/svg+xml" },
  );

it("uses native physical typography, bond widths and background controls", () => {
  expect(molecularImageOptions(1.2)).toMatchObject({
    "render-bond-thickness": 1.2,
    "render-bond-thickness-unit": "px",
  });
  const print = molecularImageOptions(2.2, {
    ...defaultFigure,
    fontPt: 9,
    transparent: true,
  });
  expect(print).toMatchObject({
    backgroundColor: "",
    "render-font-size": 9,
    "render-font-size-unit": "pt",
    "render-font-size-sub": 6,
    "render-font-size-sub-unit": "pt",
    "render-bond-thickness-unit": "pt",
    "bond-length": 14.4,
    "bond-length-unit": "pt",
    "image-resolution": 72,
  });
  expect(print["render-bond-thickness"]).toBeCloseTo(0.825, 10);
  expect(molecularImageOptions(1.6, defaultFigure).backgroundColor).toBe(
    "1,1,1",
  );
  expect(() => molecularImageOptions(5)).toThrow(/supported/);
});

it("pads native glyph and stereobond paths to paper width without scaling their geometry", async () => {
  const input = native(),
    original = await input.text();
  const blob = await molecularVector(input, {
    ...defaultFigure,
    transparent: true,
  });
  const root = new DOMParser().parseFromString(
    await blob.text(),
    "image/svg+xml",
  ).documentElement;
  expect(root.getAttribute("width")).toBe("89mm");
  const box = root.getAttribute("viewBox")!.split(" ").map(Number);
  expect(box[2]).toBeCloseTo((89 / 25.4) * 72, 10);
  expect(box[3]).toBe(90);
  expect(root.querySelector("g")!.getAttribute("transform")).toMatch(
    /^translate\(/,
  );
  expect(root.querySelector("g")!.getAttribute("transform")).not.toContain(
    "scale",
  );
  expect(root.querySelector("use")!.getAttribute("href")).toBe("#nitrogen");
  expect(root.querySelector("#nitrogen")!.getAttribute("d")).toBe(
    "M0 0L2 7L4 0",
  );
  expect(root.querySelector("path[stroke]")!.getAttribute("stroke-width")).toBe(
    "0.6",
  );
  expect(root.querySelector("rect")).toBeNull();
  expect(await input.text()).toBe(original);
});

it("requires an explicit wider layout instead of silently shrinking molecular labels", async () => {
  await expect(
    molecularVector(native(400), defaultFigure),
  ).rejects.toMatchObject({ name: "MolecularLayoutError" });
  const output = await molecularVector(native(400), {
    ...defaultFigure,
    widthMm: 183,
  });
  expect(await output.text()).toContain('width="183mm"');
});

it("retains the vector export security boundary", async () => {
  await expect(
    molecularVector(
      native(200, '<image href="https://example.org/structure"/>'),
      defaultFigure,
    ),
  ).rejects.toThrow(/External/);
  await expect(
    molecularVector(new Blob(["<svg/>"], { type: "text/html" }), defaultFigure),
  ).rejects.toThrow(/Invalid/);
});
