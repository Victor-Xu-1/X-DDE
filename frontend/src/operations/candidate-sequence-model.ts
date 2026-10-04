export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function candidateChains(value: Record<string, unknown>) {
  const metadata = record(value.metadata),
    chains = record(value.chains ?? metadata.chains);
  const found = Object.entries(chains).flatMap(([chain, raw]) => {
    const sequence = typeof raw === "string" ? raw : record(raw).sequence;
    return typeof sequence === "string" && sequence.length
      ? [{ chain, sequence }]
      : [];
  });
  return found.length
    ? found
    : typeof value.sequence === "string" && value.sequence.length
      ? [{ chain: "", sequence: value.sequence }]
      : [];
}
export function candidateMetrics(value: Record<string, unknown>) {
  const metadata = record(value.metadata),
    metrics = record(value.metrics);
  const result: Record<string, number> = {};
  for (const key of ["iptm", "ptm", "plddt", "ipsae", "ranking_score"]) {
    const number = metrics[key];
    if (typeof number === "number" && Number.isFinite(number))
      result[key] = number;
  }
  if (
    typeof metadata.esm2_llr === "number" &&
    Number.isFinite(metadata.esm2_llr)
  )
    result.esm2_llr = metadata.esm2_llr;
  for (const name of ["soluble_mpnn_scores", "soluble_mpnn_seqids"]) {
    for (const [chain, number] of Object.entries(record(metadata[name])))
      if (typeof number === "number" && Number.isFinite(number))
        result[name + ":" + chain] = number;
  }
  return result;
}
export function candidateMetricLabel(key: string) {
  if (key.startsWith("soluble_mpnn_scores:"))
    return "MPNN · " + key.split(":")[1];
  if (key.startsWith("soluble_mpnn_seqids:"))
    return "MPNN seqid · " + key.split(":")[1];
  return (
    (
      {
        iptm: "ipTM",
        ptm: "pTM",
        plddt: "pLDDT",
        ipsae: "ipSAE",
        ranking_score: "Ranking score",
        esm2_llr: "ESM2 LLR",
      } as Record<string, string>
    )[key] ?? key
  );
}
