import { validFigure, type FigureSettings } from "./settings";
import { embeddedRaster } from "./embedded-raster";
/** Physical print sizing on a cloned vector figure; no scientific data or source DOM edits. */
export function printSvg(
  source: SVGSVGElement,
  settings: FigureSettings,
): Blob {
  if (
    !validFigure(settings) ||
    source.namespaceURI !== "http://www.w3.org/2000/svg" ||
    source.localName !== "svg" ||
    source.querySelector("parsererror")
  )
    throw new Error("Invalid vector figure or print settings.");
  const copy = source.cloneNode(true) as SVGSVGElement;
  const viewBox = source.getAttribute("viewBox")?.split(/[ ,]+/).map(Number);
  const width = viewBox?.[2] ?? Number(source.getAttribute("width")),
    height = viewBox?.[3] ?? Number(source.getAttribute("height"));
  if (
    (viewBox && viewBox.length !== 4) ||
    !(width > 0 && height > 0) ||
    !Number.isFinite(width + height)
  )
    throw new Error("Vector figure needs explicit dimensions.");
  const coordinatePerPoint = width / ((settings.widthMm / 25.4) * 72);
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", settings.widthMm + "mm");
  copy.setAttribute("height", (settings.widthMm * height) / width + "mm");
  copy.setAttribute("viewBox", viewBox?.join(" ") ?? `0 0 ${width} ${height}`);
  copy.style.removeProperty("width");
  copy.style.removeProperty("height");
  for (const node of [copy, ...copy.querySelectorAll("*")]) {
    if (["foreignObject", "style"].includes(node.localName))
      throw new Error(
        "Embedded documents are not permitted in a vector figure.",
      );
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      if (
        [...attribute.value.matchAll(/url\((.*?)\)/gi)].some(
          (match) =>
            !match[1]
              .trim()
              .replace(/^["']|["']$/g, "")
              .startsWith("#"),
        )
      )
        throw new Error(
          "External styles are not permitted in a vector figure.",
        );
      if (
        ["href", "xlink:href"].includes(attribute.name) &&
        !attribute.value.startsWith("#") &&
        !(node.localName === "image" && embeddedRaster(attribute.value))
      )
        throw new Error(
          "External content is not permitted in a scientific vector figure.",
        );
    }
    node.removeAttribute("tabindex");
  }
  copy.querySelectorAll("script").forEach((node) => node.remove());
  copy.querySelectorAll("text").forEach((text) => {
    text.setAttribute("font-family", "Arial, Helvetica, sans-serif");
    text.setAttribute(
      "font-size",
      String(settings.fontPt * coordinatePerPoint),
    );
    text.style.fontFamily = "Arial, Helvetica, sans-serif";
    text.style.fontSize = `${settings.fontPt * coordinatePerPoint}px`;
  });
  if (!settings.transparent) {
    const background = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    background.setAttribute("width", String(width));
    background.setAttribute("height", String(height));
    background.setAttribute("x", String(viewBox?.[0] ?? 0));
    background.setAttribute("y", String(viewBox?.[1] ?? 0));
    background.setAttribute("fill", "white");
    copy.prepend(background);
  }
  const text = new XMLSerializer().serializeToString(copy);
  if (text.length > 4 * 1024 ** 2)
    throw new Error("Vector figure exceeds its export limit.");
  return new Blob([text], { type: "image/svg+xml" });
}
