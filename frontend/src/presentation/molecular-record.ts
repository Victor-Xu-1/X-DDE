/** Extract one immutable SDF record without changing coordinates or blank header lines. */
export function molecularRecordText(
  text: string,
  record: number,
  format: string,
) {
  if (!Number.isInteger(record) || record < 0 || record > 9999)
    throw new Error("Invalid molecular record");
  if (format !== "sdf") {
    if (record !== 0)
      throw new Error("This format has no selectable SDF records");
    return text;
  }
  const boundary = /^\$\$\$\$[ \t]*(?:\r?\n|$)/gm;
  let start = 0,
    index = 0;
  for (const match of text.matchAll(boundary)) {
    if (index === record) {
      const selected = text.slice(start, match.index);
      if (!selected.trim())
        throw new Error("Selected molecular record is empty");
      return selected;
    }
    start = match.index! + match[0].length;
    index++;
  }
  if (index === record && text.slice(start).trim()) return text.slice(start);
  throw new Error("Selected molecular record is missing");
}
