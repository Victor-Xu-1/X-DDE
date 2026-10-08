/** Native SVG heatmaps carry static PNG cells. Permit bounded PNGs, never active embedded documents. */
export function embeddedRaster(value: string) {
  if (
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) ||
    value.length > 12 * 1024 ** 2
  )
    return false;
  let data: string;
  try {
    data = atob(value.slice(value.indexOf(",") + 1));
  } catch {
    return false;
  }
  if (
    data.length < 33 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every(
      (n, i) => data.charCodeAt(i) === n,
    ) ||
    data.slice(12, 16) !== "IHDR"
  )
    return false;
  const integer = (offset: number) =>
    new DataView(
      Uint8Array.from(data.slice(offset, offset + 4), (c) => c.charCodeAt(0))
        .buffer,
    ).getUint32(0);
  const width = integer(16),
    height = integer(20);
  return (
    width > 0 &&
    height > 0 &&
    width <= 4096 &&
    height <= 4096 &&
    width * height <= 8 * 1024 ** 2
  );
}
