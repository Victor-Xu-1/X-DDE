const styleProperties = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "opacity",
] as const;
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .slice(0, 140);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Export the currently displayed scientific SVG, including its actual labels and styles. */
export function displayedSvg(svg: SVGSVGElement): Blob {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const source = [svg, ...svg.querySelectorAll("*")];
  const targets = [copy, ...copy.querySelectorAll("*")];
  source.forEach((node, index) => {
    const computed = getComputedStyle(node);
    styleProperties.forEach((property) =>
      targets[index].setAttribute(
        property,
        computed.getPropertyValue(property),
      ),
    );
    targets[index].removeAttribute("tabindex");
  });
  copy.querySelectorAll("script").forEach((node) => node.remove());
  const text = new XMLSerializer().serializeToString(copy);
  if (text.length > 2 * 1024 ** 2)
    throw new Error("This view exceeds the image export limit.");
  return new Blob([text], { type: "image/svg+xml" });
}
export function exportSvg(svg: SVGSVGElement, filename: string) {
  downloadBlob(displayedSvg(svg), filename + ".svg");
}
