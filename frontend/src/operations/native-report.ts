export interface SearchHit {
  accession: string;
  score: string;
  identity: string;
  alignedIdentity: string;
  length: string;
  sequence: string;
  alternatives: string;
}
export function sequenceHits(text: string): SearchHit[] {
  const chunks = text.split(/(?=^\d+\. \*\*)/m),
    hits: SearchHit[] = [];
  for (const chunk of chunks) {
    const head =
      /^\d+\. \*\*([A-Za-z0-9._-]+)\*\* \(score=([\d.e+-]+), identity=([\d.]+)%, aligned_identity=([\d.]+)%, length=(\d+)\)/.exec(
        chunk,
      );
    if (head)
      hits.push({
        accession: head[1],
        score: head[2],
        identity: head[3],
        alignedIdentity: head[4],
        length: head[5],
        sequence: /sequence: \x60([^\x60]+)\x60/.exec(chunk)?.[1] ?? "",
        alternatives:
          /natural alternatives \(0-based\): ([^\n]+)/.exec(chunk)?.[1] ?? "",
      });
  }
  return hits;
}
export function contactReport(text: string) {
  if (!text.startsWith("PLIP structure analysis completed.")) return [];
  return text.split(/(?=^Candidate:)/m).flatMap((chunk) => {
    const name = /^Candidate: (.+)/m.exec(chunk)?.[1];
    if (!name) return [];
    const counts = Object.fromEntries(
      [
        ...(/Interaction counts: ([^\n]+)/.exec(chunk)?.[1] ?? "").matchAll(
          /([a-z]+)=(\d+)/g,
        ),
      ].map((m) => [m[1], Number(m[2])]),
    );
    const contacts = [
      ...(/Representative contacts: ([^\n]+)/.exec(chunk)?.[1] ?? "").matchAll(
        /([^;]+?) -> ([^;]+?) \(([^,]+), ([\d.]+) A\)/g,
      ),
    ].map((m) => ({
      left: m[1].trim(),
      right: m[2].trim(),
      kind: m[3],
      distance: m[4],
    }));
    return [
      {
        name,
        counts,
        contacts,
        binder: /Binder residues: (.+)/.exec(chunk)?.[1] ?? "",
        antigen: /Antigen residues: (.+)/.exec(chunk)?.[1] ?? "",
      },
    ];
  });
}
