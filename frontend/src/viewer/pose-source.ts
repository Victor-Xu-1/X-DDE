import type { PoseSource, PreviewPose, SavedPose } from "./pose-types";
import type { ScientificObject } from "../research/types";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** Only native platform sources are eligible; never send an arbitrary URL to a compute service. */
export function poseSource(
  raw: string | undefined,
  record = 0,
  origin = location.origin,
): PoseSource | null {
  if (!raw || !Number.isInteger(record) || record < 0 || record > 499)
    return null;
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || url.username || url.password || url.hash)
      return null;
    const asset = url.pathname.match(
      new RegExp(`^/api/assets/(${uuid})$`, "i"),
    );
    if (asset) return { kind: "asset", asset_id: asset[1], record };
    const indexed = url.pathname.match(
      new RegExp(`^/api/datasets/(${uuid})/members/structure$`, "i"),
    );
    if (indexed) {
      const member = url.searchParams.get("member_id"),
        digest = url.searchParams.get("report_sha256");
      return record === 0 &&
        member &&
        member.length <= 160 &&
        !/[\x00-\x1f\x7f]/.test(member) &&
        digest &&
        /^[a-f0-9]{64}$/.test(digest) &&
        url.searchParams.getAll("member_id").length === 1 &&
        url.searchParams.getAll("report_sha256").length === 1
        ? {
            kind: "indexed",
            job_id: indexed[1],
            member_id: member,
            report_sha256: digest,
          }
        : null;
    }
    const task = url.pathname.match(
      new RegExp(`^/api/jobs/(${uuid})/download$`, "i"),
    );
    const name = url.searchParams.get("name");
    if (
      task &&
      name &&
      url.searchParams.getAll("name").length === 1 &&
      !/[\x00-\x1f\\]/.test(name)
    )
      return { kind: "artifact", job_id: task[1], name, record };
  } catch {
    /* Invalid sources cannot become task inputs. */
  }
  return null;
}

export function optimizedPose(
  previous: PreviewPose,
  saved: SavedPose,
  index: number,
): PreviewPose {
  const object = saved.pose;
  if (
    object.kind !== "molecule" ||
    object.reference.record !== 0 ||
    object.reference.conformer !== 0 ||
    object.source_job !== saved.job_id ||
    object.reference.version_id !== object.id ||
    object.relation !== "edited_from" ||
    !new RegExp(`^${uuid}$`, "i").test(object.reference.asset_id)
  )
    throw new Error("Saved pose identity is invalid.");
  if (
    saved.energy &&
    (!Number.isFinite(saved.energy.before) ||
      !Number.isFinite(saved.energy.after) ||
      saved.energy.unit !== "kcal/mol")
  )
    throw new Error("Saved pose energy is invalid.");
  const urls = [...previous.urls],
    records = previous.records ? [...previous.records] : urls.map(() => 0);
  urls[index] = `/api/assets/${object.reference.asset_id}`;
  records[index] = object.reference.record;
  return {
    urls,
    records,
    source: { kind: "version", version_id: object.id },
    receptor: saved.receptor
      ? saved.receptor.version_id
        ? { kind: "version", version_id: saved.receptor.version_id }
        : {
            kind: "asset",
            asset_id: saved.receptor.asset_id,
            record: saved.receptor.record,
          }
      : previous.receptor,
    score: saved.native_score,
    energy: saved.energy,
    versionId: object.id,
  };
}

/** Reuse an exact server-qualified computed pose; never accept a browser filesystem path. */
export function computedPose(
  previous: PreviewPose,
  object: ScientificObject,
  index: number,
): PreviewPose {
  const ref = object.reference;
  if (
    object.kind !== "molecule" ||
    ref.version_id !== object.id ||
    !new RegExp(`^${uuid}$`, "i").test(ref.asset_id) ||
    !Number.isSafeInteger(ref.record) ||
    ref.record < 0 ||
    ref.record > 499 ||
    ref.conformer !== 0
  ) {
    throw new Error("Computed pose identity is invalid.");
  }
  const urls = [...previous.urls];
  const records = previous.records ? [...previous.records] : urls.map(() => 0);
  urls[index] = `/api/assets/${ref.asset_id}`;
  records[index] = ref.record;
  return {
    ...previous,
    urls,
    records,
    source: { kind: "version", version_id: object.id },
    versionId: object.id,
  };
}
