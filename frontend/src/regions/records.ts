import { request } from "../api";
import type { MoleculeRef } from "../research/types";
import type { SavedRegion } from "./model";
export async function savedRegions(subject: MoleculeRef, signal: AbortSignal) {
  const query = new URLSearchParams({
    asset_id: subject.asset_id,
    record: String(subject.record),
    conformer: String(subject.conformer),
    limit: "200",
  });
  if (subject.version_id) query.set("version_id", subject.version_id);
  const all: SavedRegion[] = [];
  for (let offset = 0; offset <= 10000; offset += 200) {
    query.set("offset", String(offset));
    const page = await request<SavedRegion[]>(`/research/regions?${query}`, {
      signal,
    });
    all.push(...page);
    if (page.length < 200) return all;
  }
  throw new Error(
    "More saved regions exist than this view can load. Narrow the version selection.",
  );
}
