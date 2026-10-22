import { artifactUrl } from "../api";
import { readArtifactFile } from "../presentation/artifact-file";
import type { DatasetArtifact } from "./types";
import type { ModelPoint } from "./ModelValidationPlot";

export const holdoutPlotLimit = 8 * 1024 ** 2;
const fields = [
  "member",
  "heldout_cycle",
  "observed_log1p_enrichment",
  "predicted_log1p_enrichment",
];

/** Bounded RFC4180 records, including quoted identifiers, CRLF and embedded line breaks. */
function csvRecords(text: string) {
  const records: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  function field() {
    row.push(cell);
    cell = "";
    closed = false;
  }
  function record() {
    field();
    if (row.some((value) => value !== "")) records.push(row);
    row = [];
    if (records.length > 100001)
      throw new Error("Too many held-out prediction rows.");
  }
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quoted) {
      if (character === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (character === '"') {
        quoted = false;
        closed = true;
      } else cell += character;
    } else if (character === ",") field();
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[i + 1] === "\n") i++;
      record();
    } else if (character === '"' && !cell && !closed) quoted = true;
    else {
      if (character === '"' || closed)
        throw new Error("Invalid held-out CSV quoting.");
      cell += character;
    }
    if (cell.length > 10000)
      throw new Error("Held-out prediction field is too long.");
  }
  if (quoted) throw new Error("Incomplete held-out prediction CSV.");
  if (cell || row.length || closed) record();
  return records;
}

export function holdoutPredictionPoints(
  text: string,
  expected: number,
): ModelPoint[] {
  const [header, ...rows] = csvRecords(text.replace(/^\uFEFF/, ""));
  if (
    !header ||
    header.length !== fields.length ||
    new Set(header).size !== fields.length ||
    fields.some((name) => !header.includes(name)) ||
    !Number.isSafeInteger(expected) ||
    expected < 1 ||
    rows.length !== expected
  )
    throw new Error(
      "Held-out prediction count or columns differ from native evidence.",
    );
  const ids = new Set<string>();
  const position = (name: string) => header.indexOf(name);
  const number = (value: string) => {
    if (
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) ||
      !Number.isFinite(Number(value))
    )
      throw new Error("Invalid native prediction value.");
    return Number(value);
  };
  return rows.map((row) => {
    const id = row[position("member")];
    if (row.length !== header.length || !id || ids.has(id))
      throw new Error("Duplicate or incomplete held-out member evidence.");
    ids.add(id);
    return {
      observed: number(row[position(fields[2])]),
      predicted: number(row[position(fields[3])]),
    };
  });
}

export async function readHoldoutPoints(
  jobId: string,
  artifact: DatasetArtifact,
  total: number,
  signal: AbortSignal,
) {
  const { bytes } = await readArtifactFile(
    artifactUrl(jobId, artifact.name),
    signal,
    {
      maxBytes: holdoutPlotLimit,
      size: artifact.size,
      sha256: artifact.sha256,
    },
  );
  return holdoutPredictionPoints(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    total,
  );
}
