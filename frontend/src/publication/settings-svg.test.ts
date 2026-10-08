import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, expect, it, vi } from "vitest";
import { defaultFigure, figureDimensions, validFigure } from "./settings";
import { printSvg } from "./svg";

beforeEach(() => vi.stubGlobal("Blob", NodeBlob));
function svg(
  text = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><path d="M10 20 L80 60" stroke="#15988c"/><text x="20" y="100">RMSD (Å) 2.91</text></svg>',
) {
  return new DOMParser().parseFromString(text, "image/svg+xml")
    .documentElement as unknown as SVGSVGElement;
}
it("uses real paper width, exact physical resolution and a bounded native render budget", () => {
  expect(figureDimensions(defaultFigure, 1.5)).toMatchObject({
    width: 2102,
    height: 1401,
    heightMm: 89 / 1.5,
  });
  expect(
    figureDimensions({ ...defaultFigure, widthMm: 183, dpi: 300 }, 2),
  ).toMatchObject({ width: 2161, height: 1081 });
  expect(validFigure({ ...defaultFigure, dpi: "600" })).toBe(false);
  expect(() =>
    figureDimensions({ ...defaultFigure, widthMm: 183 }, 0.2),
  ).toThrow(/budget/);
  expect(() => figureDimensions(defaultFigure, NaN)).toThrow();
});
it("retains vector geometry and measured labels while setting physical typography on a clone", async () => {
  const source = svg(),
    original = source.outerHTML;
  const output = svg(await printSvg(source, defaultFigure).text());
  expect(source.outerHTML).toBe(original);
  expect(output.getAttribute("width")).toBe("89mm");
  expect(output.getAttribute("viewBox")).toBe("0 0 400 240");
  expect(output.querySelector("path")?.getAttribute("d")).toBe("M10 20 L80 60");
  expect(output.querySelector("text")?.textContent).toBe("RMSD (Å) 2.91");
  const printedPt =
    (Number(output.querySelector("text")?.getAttribute("font-size")) *
      ((89 / 25.4) * 72)) /
    400;
  expect(printedPt).toBeCloseTo(7, 10);
  expect(output.querySelector("rect")?.getAttribute("fill")).toBe("white");
  expect(
    svg(
      await printSvg(source, { ...defaultFigure, transparent: true }).text(),
    ).querySelector("rect"),
  ).toBeNull();
});
it("rejects external documents and malformed dimensions while retaining safe native clip references", async () => {
  expect(() =>
    printSvg(
      svg(
        '<svg viewBox="0 0 4 4"><image href="https://example.org/file"/></svg>',
      ),
      defaultFigure,
    ),
  ).toThrow(/External/);
  expect(() =>
    printSvg(
      svg('<svg viewBox="0 0 4 4"><foreignObject/></svg>'),
      defaultFigure,
    ),
  ).toThrow(/Embedded/);
  expect(() =>
    printSvg(svg('<svg viewBox="0 0 NaN 4"/>'), defaultFigure),
  ).toThrow();
  const safe = svg(
    '<svg viewBox="0 0 4 4"><path clip-path="url(\'#native-clip\')" onclick="bad()"/></svg>',
  );
  const result = svg(await printSvg(safe, defaultFigure).text());
  expect(result.querySelector("path")?.getAttribute("clip-path")).toBe(
    "url('#native-clip')",
  );
  expect(result.querySelector("path")?.hasAttribute("onclick")).toBe(false);
});
