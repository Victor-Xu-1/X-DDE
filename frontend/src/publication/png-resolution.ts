/** Write physical resolution only. Pixel bytes, geometry and colors remain unchanged. */
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++)
    crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
export async function pngResolution(blob: Blob, dpi: 300 | 600): Promise<Blob> {
  const data = new Uint8Array(await blob.arrayBuffer());
  if (
    data.length > 64 * 1024 ** 2 ||
    ![300, 600].includes(dpi) ||
    data.length < 33 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => data[i] === byte)
  )
    throw new Error("Invalid native PNG figure.");
  const pieces: Uint8Array<ArrayBuffer>[] = [data.slice(0, 8)];
  const physical = new Uint8Array(21),
    view = new DataView(physical.buffer);
  view.setUint32(0, 9);
  physical.set(new TextEncoder().encode("pHYs"), 4);
  view.setUint32(8, Math.round(dpi / 0.0254));
  view.setUint32(12, Math.round(dpi / 0.0254));
  physical[16] = 1;
  view.setUint32(17, crc32(physical.subarray(4, 17)));
  let offset = 8,
    inserted = false,
    ended = false,
    image = false,
    chunks = 0;
  while (offset < data.length) {
    if (offset + 12 > data.length)
      throw new Error("Truncated native PNG figure.");
    const length = new DataView(data.buffer).getUint32(offset),
      end = offset + length + 12;
    if (end > data.length) throw new Error("Truncated native PNG chunk.");
    const type = new TextDecoder().decode(data.slice(offset + 4, offset + 8));
    if (++chunks > 100000 || ended || (offset === 8 && type !== "IHDR"))
      throw new Error("Invalid PNG chunk order.");
    if (
      crc32(data.subarray(offset + 4, end - 4)) !==
      new DataView(data.buffer).getUint32(end - 4)
    )
      throw new Error("Corrupt native PNG figure.");
    if (type !== "pHYs") pieces.push(data.slice(offset, end));
    if (type === "IHDR") {
      if (inserted || length !== 13) throw new Error("Invalid PNG header.");
      pieces.push(physical);
      inserted = true;
    }
    if (type === "IDAT") image = true;
    if (type === "IEND") {
      if (length !== 0 || !image)
        throw new Error("Incomplete native PNG image.");
      ended = true;
      if (end !== data.length)
        throw new Error("Unexpected PNG trailing content.");
    }
    offset = end;
  }
  if (!inserted || !ended) throw new Error("Incomplete native PNG figure.");
  return new Blob(pieces, { type: "image/png" });
}
export async function dataUrlBlob(url: string): Promise<Blob> {
  const header =
    /^data:(image\/(?:png|svg\+xml))((?:;charset=utf-8|;utf8)?)(;base64)?,/i.exec(
      url,
    );
  if (!header || url.length > 90 * 1024 ** 2)
    throw new Error("Unsupported figure data.");
  const payload = url.slice(header[0].length);
  const bytes = header[3]
    ? Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  if (bytes.length > 64 * 1024 ** 2)
    throw new Error("Figure data exceeds its size limit.");
  return new Blob([bytes], { type: header[1] });
}
