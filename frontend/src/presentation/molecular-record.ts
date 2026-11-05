/** Use identical record boundaries for counting, depiction and original downloads. */
export function* sdfRecordRanges(text: string) {
  const boundary =
    /(?:^|(?<=[\r\n]))[ \t\v\f]*\$\$\$\$[ \t\v\f]*(?:\r\n|\r|\n|$)/g;
  let start = 0;
  for (const match of text.matchAll(boundary)) {
    const end = match.index + match[0].length;
    yield { start, contentEnd: match.index, end };
    start = end;
  }
  if (text.slice(start).trim())
    yield { start, contentEnd: text.length, end: text.length };
}

function sdfRecord(text: string, record: number) {
  let index = 0;
  for (const range of sdfRecordRanges(text)) {
    if (index++ !== record) continue;
    if (!text.slice(range.start, range.contentEnd).trim())
      throw new Error("Selected molecular record is empty");
    return range;
  }
  throw new Error("Selected molecular record is missing");
}

function requireRecord(record: number) {
  if (!Number.isInteger(record) || record < 0 || record > 9999)
    throw new Error("Invalid molecular record");
}

/** Extract one immutable SDF record without changing coordinates or blank header lines. */
export function molecularRecordText(
  text: string,
  record: number,
  format: string,
) {
  requireRecord(record);
  if (format !== "sdf") {
    if (record !== 0)
      throw new Error("This format has no selectable SDF records");
    return text;
  }
  const range = sdfRecord(text, record);
  return text.slice(range.start, range.contentEnd);
}

/** ASCII separators can be located without re-encoding any source byte. */
export function sdfRecordBytes(bytes: Uint8Array<ArrayBuffer>, record: number) {
  requireRecord(record);
  const text = new TextDecoder("iso-8859-1").decode(bytes);
  const range = sdfRecord(text, record);
  return bytes.slice(range.start, range.end);
}
